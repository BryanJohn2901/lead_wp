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
  paused: boolean;
  stopRequested: boolean;
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

// Stable selectors for WhatsApp Web — listed most-specific first for reliability
const CHAT_LIST_SELECTOR = [
  "div[data-testid='chat-list']",
  "div[aria-label='Lista de conversas']",
  "div[aria-label='Chat list']",
  "div[contenteditable='true'][data-tab='3']",
  "div[aria-label='Pesquisar ou começar uma nova conversa']",
  "div[aria-label='Search or start new chat']",
].join(", ");

const QR_CODE_SELECTOR = [
  "[data-testid='qrcode']",
  "[data-testid='qr-code']",
  "canvas[aria-label*='Scan']",
  "canvas[aria-label*='scan']",
  "div[data-ref]", // WhatsApp internal QR container
].join(", ");

const MESSAGE_COMPOSER_SELECTOR = [
  "div[data-testid='conversation-compose-box-input']",
  "div[aria-label='Digite uma mensagem'][contenteditable='true']",
  "div[aria-label='Type a message'][contenteditable='true']",
  "footer div[contenteditable='true']",
  "div[contenteditable='true'][data-tab='10']",
  "div[contenteditable='true'][data-tab='6']",
  "div[contenteditable='true'][role='textbox']",
].join(", ");

const SEND_BUTTON_SELECTOR = [
  "button[data-testid='compose-btn-send']",
  "button[aria-label='Enviar']",
  "button[aria-label='Send']",
].join(", ");

type StoredJob = SendWhatsappJobStatus;

const globalState = globalThis as typeof globalThis & {
  __leadHunterWhatsappJobs?: Map<string, StoredJob>;
  __leadHunterBrowserBusy?: boolean;
};

const jobs = globalState.__leadHunterWhatsappJobs ?? new Map<string, StoredJob>();
globalState.__leadHunterWhatsappJobs = jobs;

function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactJobs(): void {
  if (jobs.size <= MAX_STORED_JOBS) return;

  const completed = Array.from(jobs.values()).filter(
    (job) => job.status === "completed" || job.status === "failed",
  );
  completed.sort((a, b) => a.jobId.localeCompare(b.jobId));

  while (jobs.size > MAX_STORED_JOBS && completed.length) {
    const old = completed.shift();
    if (old) jobs.delete(old.jobId);
  }
}

function extractConnectedNumberFromStorage(rawValues: string[]): string | null {
  for (const raw of rawValues) {
    const match = raw.match(/(\d{10,15})@s\.whatsapp\.net/);
    if (match?.[1]) return `+${match[1]}`;
  }
  return null;
}

async function checkInvalidNumber(page: import("playwright").Page): Promise<boolean> {
  const phrases = [
    "número de telefone compartilhado através de url é inválido",
    "phone number shared via url is invalid",
  ];
  for (const phrase of phrases) {
    const visible = await page
      .getByText(phrase, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) return true;
  }
  return false;
}

async function getConnectedIdentity(
  page: import("playwright").Page,
): Promise<{ connectedName: string | null; connectedNumber: string | null }> {
  // Get name from the profile/header area, excluding generic labels
  const connectedName = await page
    .locator("header button[aria-label] span[title], header span[data-testid='conversation-info-header-chat-title']")
    .first()
    .getAttribute("title")
    .catch(() => null)
    .then((title) => {
      const cleaned = title?.trim() ?? null;
      if (!cleaned || cleaned === "Perfil" || cleaned === "Profile") return null;
      return cleaned;
    });

  const connectedNumber = await page
    .evaluate(() => {
      const values = Object.values(window.localStorage ?? {});
      return values
        .filter((value): value is string => typeof value === "string")
        .slice(0, 500);
    })
    .then((values) => extractConnectedNumberFromStorage(values))
    .catch(() => null);

  return { connectedName, connectedNumber };
}

async function isWhatsappLoggedIn(page: import("playwright").Page): Promise<boolean> {
  // If QR code is visible → definitely not logged in
  const qrCodeVisible = await page
    .locator(QR_CODE_SELECTOR)
    .first()
    .isVisible()
    .catch(() => false);
  if (qrCodeVisible) return false;

  // If chat list is visible → logged in
  return page
    .locator(CHAT_LIST_SELECTOR)
    .first()
    .isVisible()
    .catch(() => false);
}

async function waitForWhatsappLogin(page: import("playwright").Page): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < QR_SCAN_TIMEOUT_MS) {
    if (page.isClosed()) return false;

    const loggedIn = await isWhatsappLoggedIn(page);
    if (loggedIn) return true;

    try {
      await page.waitForTimeout(QR_SCAN_POLL_MS);
    } catch {
      return false;
    }
  }

  return false;
}

async function resolveConnectionStatus(
  openWindow: boolean,
): Promise<WhatsappConnectionStatusResponse> {
  // If a job is actively running, derive status from it to avoid browser conflict
  const activeJob = Array.from(jobs.values()).find(
    (job) => job.status === "pending_qr" || job.status === "running",
  );
  if (activeJob) {
    return {
      whatsappConnected: activeJob.whatsappConnected,
      connectedName: activeJob.connectedName,
      connectedNumber: activeJob.connectedNumber,
    };
  }

  if (globalState.__leadHunterBrowserBusy) {
    return { whatsappConnected: false, connectedName: null, connectedNumber: null };
  }

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
      return { whatsappConnected: false, connectedName: null, connectedNumber: null };
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
  globalState.__leadHunterBrowserBusy = true;

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
    if (!job) return;

    job.status = "pending_qr";
    job.waitingQrScan = true;
    job.paused = false;
    job.stopRequested = false;
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
      // --- Pause / Stop gate ---
      while (true) {
        const ctrl = jobs.get(jobId);
        if (!ctrl || ctrl.stopRequested) {
          job.status = "completed";
          job.currentPhone = null;
          jobs.set(jobId, job);
          return;
        }
        if (!ctrl.paused) break;
        await page.waitForTimeout(500).catch(() => {});
      }
      // -------------------------

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
          { waitUntil: "domcontentloaded", timeout: 45_000 },
        );

        // Wait for message composer or invalid-number dialog — whichever appears first
        const messageComposer = page.locator(MESSAGE_COMPOSER_SELECTOR).first();
        let composerReady = false;

        try {
          await messageComposer.waitFor({ state: "visible", timeout: 25_000 });
          composerReady = true;
        } catch {
          // Timeout — check if an invalid number dialog appeared instead
        }

        if (!composerReady) {
          const invalid = await checkInvalidNumber(page);
          if (invalid) {
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

          // Try a page reload once before giving up
          try {
            await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
            await messageComposer.waitFor({ state: "visible", timeout: 15_000 });
            composerReady = true;
          } catch {
            throw new Error("Timeout: não foi possível abrir a conversa.");
          }
        }

        // Double-check: invalid number dialog might appear after the composer times out and we reload
        if (await checkInvalidNumber(page)) {
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

        // Try the send button first; fall back to Enter if it's not found
        const sendButton = page.locator(SEND_BUTTON_SELECTOR).first();
        let buttonReady = false;
        try {
          await sendButton.waitFor({ state: "visible", timeout: 5_000 });
          buttonReady = true;
        } catch {
          buttonReady = false;
        }

        if (buttonReady) {
          await sendButton.click();
        } else {
          await messageComposer.click();
          await page.keyboard.press("Enter");
        }

        // Brief wait to allow the message to be delivered
        await page.waitForTimeout(1_500);

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
        // Poll in 500ms steps so pause/stop are respected during the interval
        const POLL_MS = 500;
        let elapsed = 0;
        while (elapsed < MESSAGE_INTERVAL_MS) {
          if (page.isClosed()) {
            job.status = "failed";
            job.error = "A janela do WhatsApp foi fechada durante o envio.";
            job.currentPhone = null;
            jobs.set(jobId, job);
            return;
          }
          const ctrl = jobs.get(jobId);
          if (!ctrl || ctrl.stopRequested) {
            job.status = "completed";
            job.currentPhone = null;
            jobs.set(jobId, job);
            return;
          }
          await page.waitForTimeout(POLL_MS).catch(() => {});
          if (!ctrl.paused) elapsed += POLL_MS; // timer pauses when job is paused
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
    globalState.__leadHunterBrowserBusy = false;
    await context.close();
  }
}

export async function PATCH(
  request: Request,
): Promise<NextResponse<{ ok: boolean } | ErrorResponse>> {
  const body = (await request.json()) as { jobId?: string; action?: string };
  const { jobId, action } = body;

  if (!jobId || !action) {
    return NextResponse.json({ error: "jobId e action são obrigatórios." }, { status: 400 });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }

  if (action === "stop") {
    job.stopRequested = true;
    job.paused = false;
  } else if (action === "pause") {
    job.paused = true;
  } else if (action === "resume") {
    job.paused = false;
  } else {
    return NextResponse.json({ error: "Action inválida." }, { status: 400 });
  }

  jobs.set(jobId, job);
  return NextResponse.json({ ok: true });
}

export async function GET(
  request: Request,
): Promise<NextResponse<StoredJob | WhatsappConnectionStatusResponse | ErrorResponse>> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (jobId) {
    const job = jobs.get(jobId);
    if (!job) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
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
    paused: false,
    stopRequested: false,
    results: [],
  });
  compactJobs();

  void runSendJob(jobId, normalizedNumbers, message);

  return NextResponse.json({ jobId });
}
