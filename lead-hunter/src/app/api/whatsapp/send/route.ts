import path from "node:path";
import { chromium } from "playwright";
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const maxDuration = 300;

interface SendWhatsappRequest {
  numbers: string[];
  message: string;
}

interface SendResultItem {
  phone: string;
  success: boolean;
  reason?: string;
}

interface SendWhatsappStartResponse {
  jobId: string;
}

interface SendWhatsappJobStatus {
  jobId: string;
  status: "pending_qr" | "running" | "completed" | "failed";
  total: number;
  processed: number;
  sent: number;
  failed: number;
  remaining: number;
  current: number;
  currentPhone: string | null;
  whatsappConnected: boolean;
  connectedName: string | null;
  connectedNumber: string | null;
  waitingQrScan: boolean;
  results: SendResultItem[];
  error?: string;
}

interface WhatsappConnectionStatusResponse {
  whatsappConnected: boolean;
  connectedName: string | null;
  connectedNumber: string | null;
}

interface ErrorResponse {
  error: string;
}

const MESSAGE_INTERVAL_MS = 15_000;
const QR_SCAN_TIMEOUT_MS = 120_000;
const QR_SCAN_POLL_MS = 2_000;
const MAX_STORED_JOBS = 20;

type StoredJob = SendWhatsappJobStatus;

const globalJobs = globalThis as typeof globalThis & {
  __leadHunterWhatsappJobs?: Map<string, StoredJob>;
};

const jobs = globalJobs.__leadHunterWhatsappJobs ?? new Map<string, StoredJob>();
globalJobs.__leadHunterWhatsappJobs = jobs;

function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactJobs(): void {
  if (jobs.size <= MAX_STORED_JOBS) {
    return;
  }

  const completed = Array.from(jobs.values()).filter(
    (job) => job.status === "completed" || job.status === "failed",
  );
  completed.sort((a, b) => a.jobId.localeCompare(b.jobId));

  while (jobs.size > MAX_STORED_JOBS && completed.length) {
    const old = completed.shift();
    if (old) {
      jobs.delete(old.jobId);
    }
  }
}

function extractConnectedNumberFromStorage(rawValues: string[]): string | null {
  for (const raw of rawValues) {
    const match = raw.match(/(\d{10,15})@s\.whatsapp\.net/);
    if (match?.[1]) {
      return `+${match[1]}`;
    }
  }
  return null;
}

async function getConnectedIdentity(
  page: import("playwright").Page,
): Promise<{ connectedName: string | null; connectedNumber: string | null }> {
  const connectedName = await page
    .locator("header span[title], span[title='Perfil']")
    .first()
    .getAttribute("title")
    .catch(() => null);

  const connectedNumber = await page
    .evaluate(() => {
      const values = Object.values(window.localStorage ?? {});
      return values
        .filter((value): value is string => typeof value === "string")
        .slice(0, 500);
    })
    .then((values) => extractConnectedNumberFromStorage(values))
    .catch(() => null);

  return {
    connectedName: connectedName?.trim() || null,
    connectedNumber,
  };
}

async function isWhatsappLoggedIn(page: import("playwright").Page): Promise<boolean> {
  const qrCodeVisible = await page
    .locator('canvas[aria-label*="Scan"], [data-testid="qrcode"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (qrCodeVisible) {
    return false;
  }

  const appReady = await page
    .locator(
      [
        "div[role='grid']",
        "div[aria-label='Lista de conversas']",
        "div[contenteditable='true'][data-tab='3']",
        "div[title='Pesquisar ou começar uma nova conversa']",
      ].join(", "),
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (appReady) {
    return true;
  }

  const encryptedLandingVisible = await page
    .locator("text=End-to-end encrypted")
    .first()
    .isVisible()
    .catch(() => false);

  return encryptedLandingVisible;
}

async function waitForWhatsappLogin(page: import("playwright").Page): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < QR_SCAN_TIMEOUT_MS) {
    if (page.isClosed()) {
      return false;
    }

    const loggedIn = await isWhatsappLoggedIn(page);
    if (loggedIn) {
      return true;
    }

    try {
      await page.waitForTimeout(QR_SCAN_POLL_MS);
    } catch {
      return false;
    }
  }

  return false;
}

async function resolveConnectionStatus(openWindow: boolean): Promise<WhatsappConnectionStatusResponse> {
  const userDataDir = path.join(process.cwd(), ".whatsapp-session");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: !openWindow,
    locale: "pt-BR",
    viewport: { width: 1400, height: 900 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://web.whatsapp.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const loggedIn = await waitForWhatsappLogin(page);
    if (!loggedIn) {
      return {
        whatsappConnected: false,
        connectedName: null,
        connectedNumber: null,
      };
    }

    const identity = await getConnectedIdentity(page);
    return {
      whatsappConnected: true,
      connectedName: identity.connectedName,
      connectedNumber: identity.connectedNumber,
    };
  } finally {
    await context.close();
  }
}

async function runSendJob(
  jobId: string,
  normalizedNumbers: string[],
  message: string,
): Promise<void> {
  const userDataDir = path.join(process.cwd(), ".whatsapp-session");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    locale: "pt-BR",
    viewport: { width: 1400, height: 900 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://web.whatsapp.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const job = jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = "pending_qr";
    job.waitingQrScan = true;
    jobs.set(jobId, job);

    const loggedIn = await waitForWhatsappLogin(page);
    if (!loggedIn) {
      job.status = "failed";
      job.error =
        "WhatsApp não autenticado. Escaneie o QR Code (tempo limite: 2 minutos) e tente novamente.";
      job.waitingQrScan = false;
      jobs.set(jobId, job);
      return;
    }

    const identity = await getConnectedIdentity(page);
    job.whatsappConnected = true;
    job.connectedName = identity.connectedName;
    job.connectedNumber = identity.connectedNumber;
    job.waitingQrScan = false;
    job.status = "running";
    jobs.set(jobId, job);

    for (const [index, normalized] of normalizedNumbers.entries()) {
      job.current = index + 1;
      job.currentPhone = normalized;
      jobs.set(jobId, job);

      if (page.isClosed()) {
        job.status = "failed";
        job.error = "A janela do WhatsApp foi fechada durante o envio.";
        job.currentPhone = null;
        jobs.set(jobId, job);
        return;
      }

      const phone = normalized.replace("+", "");
      try {
        await page.goto(
          `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`,
          {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          },
        );

        await page.waitForTimeout(2_000);

        const invalidNumber = await page
          .locator("text=O número de telefone compartilhado através de url é inválido")
          .first()
          .isVisible()
          .catch(() => false);

        if (invalidNumber) {
          job.results.push({
            phone: normalized,
            success: false,
            reason: "Número inválido no WhatsApp",
          });
          job.failed += 1;
          job.processed += 1;
          job.remaining = Math.max(job.total - job.processed, 0);
          jobs.set(jobId, job);
          continue;
        }

        const messageComposer = page
          .locator(
            [
              "footer div[contenteditable='true']",
              "div[contenteditable='true'][data-tab='10']",
              "div[contenteditable='true'][data-tab='6']",
              "div[aria-label*='mensagem'][contenteditable='true']",
              "div[contenteditable='true'][role='textbox']",
            ].join(", "),
          )
          .first();

        try {
          await messageComposer.waitFor({ state: "visible", timeout: 30_000 });
        } catch {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
          await messageComposer.waitFor({ state: "visible", timeout: 20_000 });
        }
        await messageComposer.click();
        await page.keyboard.press("Enter");

        const sendButton = page
          .locator("button[aria-label='Enviar'], button span[data-icon='send']")
          .first();
        const buttonVisible = await sendButton.isVisible().catch(() => false);
        if (buttonVisible) {
          await sendButton.click().catch(() => undefined);
        }

        await page.waitForTimeout(1_200);

        job.results.push({ phone: normalized, success: true });
        job.sent += 1;
      } catch (error: unknown) {
        job.results.push({
          phone: normalized,
          success: false,
          reason: error instanceof Error ? error.message : "Erro inesperado",
        });
        job.failed += 1;
      }

      job.processed += 1;
      job.remaining = Math.max(job.total - job.processed, 0);
      jobs.set(jobId, job);

      const hasNextNumber = index < normalizedNumbers.length - 1;
      if (hasNextNumber) {
        if (page.isClosed()) {
          job.status = "failed";
          job.error = "A janela do WhatsApp foi fechada durante o envio.";
          job.currentPhone = null;
          jobs.set(jobId, job);
          return;
        }

        try {
          await page.waitForTimeout(MESSAGE_INTERVAL_MS);
        } catch {
          job.status = "failed";
          job.error = "A janela do WhatsApp foi fechada durante o envio.";
          job.currentPhone = null;
          jobs.set(jobId, job);
          return;
        }
      }
    }

    job.status = "completed";
    job.currentPhone = null;
    job.current = job.total;
    jobs.set(jobId, job);
  } catch (error: unknown) {
    const job = jobs.get(jobId);
    if (job) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Erro inesperado no envio";
      job.currentPhone = null;
      jobs.set(jobId, job);
    }
  } finally {
    await context.close();
  }
}

export async function GET(request: Request): Promise<NextResponse<StoredJob | WhatsappConnectionStatusResponse | ErrorResponse>> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (jobId) {
    const job = jobs.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  try {
    const openWindow = url.searchParams.get("open") === "1";
    const status = await resolveConnectionStatus(openWindow);
    return NextResponse.json(status);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar status do WhatsApp.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<SendWhatsappStartResponse | ErrorResponse>> {
  const body = (await request.json()) as Partial<SendWhatsappRequest>;
  const message = body.message?.trim() ?? "";
  const incomingNumbers = Array.isArray(body.numbers) ? body.numbers : [];

  if (!message) {
    return NextResponse.json(
      { error: "Mensagem obrigatória para envio." },
      { status: 400 },
    );
  }

  if (!incomingNumbers.length) {
    return NextResponse.json(
      { error: "Informe ao menos um número para envio." },
      { status: 400 },
    );
  }

  const normalizedNumbers = Array.from(
    new Set(
      incomingNumbers
        .map((phone) => normalizePhone(phone))
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );

  if (!normalizedNumbers.length) {
    return NextResponse.json(
      { error: "Nenhum número válido após normalização." },
      { status: 400 },
    );
  }

  const jobId = createJobId();
  jobs.set(jobId, {
    jobId,
    status: "pending_qr",
    total: normalizedNumbers.length,
    processed: 0,
    sent: 0,
    failed: 0,
    remaining: normalizedNumbers.length,
    current: 0,
    currentPhone: null,
    whatsappConnected: false,
    connectedName: null,
    connectedNumber: null,
    waitingQrScan: true,
    results: [],
  });
  compactJobs();

  void runSendJob(jobId, normalizedNumbers, message);

  return NextResponse.json({ jobId });
}
