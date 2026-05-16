import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const maxDuration = 300;

const EVOLUTION_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, "") ?? "";
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_API_INSTANCE ?? "lead-hunter";

const MESSAGE_INTERVAL_MS = 15_000;
const QR_SCAN_TIMEOUT_MS = 120_000;
const QR_SCAN_POLL_MS = 3_000;
const MAX_STORED_JOBS = 20;

interface SendResultItem {
  phone: string;
  success: boolean;
  reason?: string;
}

export interface SendJobStatus {
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
  qrCode: string | null;
  paused: boolean;
  stopRequested: boolean;
  results: SendResultItem[];
  error?: string;
}

interface ErrorResponse {
  error: string;
}

const globalState = globalThis as typeof globalThis & {
  __leadHunterJobs?: Map<string, SendJobStatus>;
};
const jobs = globalState.__leadHunterJobs ?? new Map<string, SendJobStatus>();
globalState.__leadHunterJobs = jobs;

// ── Evolution API helpers ──────────────────────────────────────────────────

function evolutionFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!EVOLUTION_URL) throw new Error("EVOLUTION_API_URL não configurado.");
  return fetch(`${EVOLUTION_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_KEY,
      ...(init?.headers ?? {}),
    },
  });
}

async function ensureInstance(): Promise<void> {
  const res = await evolutionFetch("/instance/fetchInstances");
  if (!res.ok) throw new Error("Falha ao consultar instâncias da Evolution API.");
  const list = (await res.json()) as Array<{ instanceName: string }>;
  const exists = list.some((i) => i.instanceName === EVOLUTION_INSTANCE);
  if (!exists) {
    const create = await evolutionFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({ instanceName: EVOLUTION_INSTANCE, qrcode: true }),
    });
    if (!create.ok) throw new Error("Falha ao criar instância da Evolution API.");
  }
}

async function getConnectionState(): Promise<"open" | "connecting" | "close"> {
  try {
    const res = await evolutionFetch(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
    if (!res.ok) return "close";
    const data = (await res.json()) as { instance?: { state?: string }; state?: string };
    return (data.instance?.state ?? data.state ?? "close") as "open" | "connecting" | "close";
  } catch {
    return "close";
  }
}

async function fetchQrCode(): Promise<string | null> {
  try {
    const res = await evolutionFetch(`/instance/connect/${EVOLUTION_INSTANCE}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { base64?: string; qrcode?: { base64?: string } };
    return data.base64 ?? data.qrcode?.base64 ?? null;
  } catch {
    return null;
  }
}

async function getConnectedIdentity(): Promise<{ connectedName: string | null; connectedNumber: string | null }> {
  try {
    const res = await evolutionFetch("/instance/fetchInstances");
    if (!res.ok) return { connectedName: null, connectedNumber: null };
    const list = (await res.json()) as Array<{
      instanceName: string;
      profileName?: string;
      ownerJid?: string;
    }>;
    const inst = list.find((i) => i.instanceName === EVOLUTION_INSTANCE);
    if (!inst) return { connectedName: null, connectedNumber: null };
    return {
      connectedName: inst.profileName ?? null,
      connectedNumber: inst.ownerJid ? `+${inst.ownerJid.replace(/@.*$/, "")}` : null,
    };
  } catch {
    return { connectedName: null, connectedNumber: null };
  }
}

async function sendText(
  phone: string,
  text: string,
): Promise<{ success: boolean; reason?: string }> {
  try {
    const number = phone.replace("+", "");
    const res = await evolutionFetch(`/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      return { success: false, reason: body.error ?? body.message ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : "Erro inesperado" };
  }
}

// ── Job helpers ───────────────────────────────────────────────────────────

function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactJobs(): void {
  if (jobs.size <= MAX_STORED_JOBS) return;
  const done = Array.from(jobs.values())
    .filter((j) => j.status === "completed" || j.status === "failed")
    .sort((a, b) => a.jobId.localeCompare(b.jobId));
  while (jobs.size > MAX_STORED_JOBS && done.length) {
    const old = done.shift();
    if (old) jobs.delete(old.jobId);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Background job ────────────────────────────────────────────────────────

async function runSendJob(jobId: string, numbers: string[], message: string): Promise<void> {
  const fail = (error: string): void => {
    const j = jobs.get(jobId);
    if (j) { j.status = "failed"; j.error = error; j.currentPhone = null; jobs.set(jobId, j); }
  };

  try {
    await ensureInstance();
  } catch (err) {
    fail(err instanceof Error ? err.message : "Erro ao inicializar instância.");
    return;
  }

  const job = jobs.get(jobId);
  if (!job) return;

  // Wait for QR scan / reconnection
  job.status = "pending_qr";
  job.waitingQrScan = true;
  jobs.set(jobId, job);

  const deadline = Date.now() + QR_SCAN_TIMEOUT_MS;
  let connected = false;

  while (Date.now() < deadline) {
    if ((await getConnectionState()) === "open") { connected = true; break; }
    job.qrCode = await fetchQrCode();
    jobs.set(jobId, job);
    await sleep(QR_SCAN_POLL_MS);
  }

  if (!connected) {
    fail("WhatsApp não autenticado. Escaneie o QR Code (limite: 2 minutos) e tente novamente.");
    job.waitingQrScan = false;
    job.qrCode = null;
    jobs.set(jobId, job);
    return;
  }

  const identity = await getConnectedIdentity();
  job.whatsappConnected = true;
  job.connectedName = identity.connectedName;
  job.connectedNumber = identity.connectedNumber;
  job.waitingQrScan = false;
  job.qrCode = null;
  job.status = "running";
  jobs.set(jobId, job);

  for (const [index, phone] of numbers.entries()) {
    // Pause / stop gate
    for (;;) {
      const ctrl = jobs.get(jobId);
      if (!ctrl || ctrl.stopRequested) {
        job.status = "completed"; job.currentPhone = null; jobs.set(jobId, job); return;
      }
      if (!ctrl.paused) break;
      await sleep(500);
    }

    job.current = index + 1;
    job.currentPhone = phone;
    jobs.set(jobId, job);

    const result = await sendText(phone, message);

    if (result.success) {
      job.results.push({ phone, success: true });
      job.sent += 1;
    } else {
      job.results.push({ phone, success: false, reason: result.reason });
      job.failed += 1;
    }

    job.processed += 1;
    job.remaining = Math.max(job.total - job.processed, 0);
    jobs.set(jobId, job);

    if (index < numbers.length - 1) {
      let elapsed = 0;
      while (elapsed < MESSAGE_INTERVAL_MS) {
        const ctrl = jobs.get(jobId);
        if (!ctrl || ctrl.stopRequested) {
          job.status = "completed"; job.currentPhone = null; jobs.set(jobId, job); return;
        }
        await sleep(500);
        if (ctrl && !ctrl.paused) elapsed += 500;
      }
    }
  }

  job.status = "completed";
  job.currentPhone = null;
  job.current = job.total;
  jobs.set(jobId, job);
}

// ── HTTP handlers ─────────────────────────────────────────────────────────

export async function GET(
  request: Request,
): Promise<NextResponse<SendJobStatus | ErrorResponse>> {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Parâmetro jobId é obrigatório." }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  return NextResponse.json(job);
}

export async function POST(
  request: Request,
): Promise<NextResponse<{ jobId: string } | ErrorResponse>> {
  if (!EVOLUTION_URL) {
    return NextResponse.json(
      { error: "EVOLUTION_API_URL não configurado. Defina a variável de ambiente com a URL da sua Evolution API." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Partial<{ numbers: string[]; message: string }>;
  const message = body.message?.trim() ?? "";
  const incoming = Array.isArray(body.numbers) ? body.numbers : [];

  if (!message) return NextResponse.json({ error: "Mensagem obrigatória para envio." }, { status: 400 });
  if (!incoming.length) return NextResponse.json({ error: "Informe ao menos um número para envio." }, { status: 400 });

  const normalized = Array.from(
    new Set(incoming.map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p))),
  );
  if (!normalized.length) return NextResponse.json({ error: "Nenhum número válido após normalização." }, { status: 400 });

  const jobId = createJobId();
  jobs.set(jobId, {
    jobId,
    status: "pending_qr",
    total: normalized.length,
    processed: 0,
    sent: 0,
    failed: 0,
    remaining: normalized.length,
    current: 0,
    currentPhone: null,
    whatsappConnected: false,
    connectedName: null,
    connectedNumber: null,
    waitingQrScan: true,
    qrCode: null,
    paused: false,
    stopRequested: false,
    results: [],
  });
  compactJobs();

  void runSendJob(jobId, normalized, message);

  return NextResponse.json({ jobId });
}

export async function PATCH(
  request: Request,
): Promise<NextResponse<{ ok: boolean } | ErrorResponse>> {
  const body = (await request.json()) as { jobId?: string; action?: string };
  const { jobId, action } = body;

  if (!jobId || !action) return NextResponse.json({ error: "jobId e action são obrigatórios." }, { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });

  if (action === "stop") { job.stopRequested = true; job.paused = false; }
  else if (action === "pause") { job.paused = true; }
  else if (action === "resume") { job.paused = false; }
  else return NextResponse.json({ error: "Action inválida." }, { status: 400 });

  jobs.set(jobId, job);
  return NextResponse.json({ ok: true });
}
