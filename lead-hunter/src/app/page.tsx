"use client";

import { Crosshair, Download, MessageCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { LeadsTable } from "@/components/LeadsTable";
import { SearchForm } from "@/components/SearchForm";
import { normalizePhone } from "@/lib/phone";
import type { Lead, ScraperResponse } from "@/types/lead";

interface ApiErrorResponse {
  error?: string;
}

interface WhatsappSendResponse {
  jobId: string;
}

interface WhatsappSendJobStatus {
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
  results: Array<{
    phone: string;
    success: boolean;
    reason?: string;
  }>;
  error?: string;
}

const PAGE_SIZE = 30;

function getErrorMessage(
  data: ScraperResponse | WhatsappSendResponse | WhatsappSendJobStatus | ApiErrorResponse,
  fallback: string,
): string {
  if ("error" in data && typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  return fallback;
}

export default function Home(): React.JSX.Element {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; discarded: number } | null>(
    null,
  );
  const [lastQuery, setLastQuery] = useState<{ niche: string; location: string } | null>(
    null,
  );
  const [currentLimit, setCurrentLimit] = useState<number>(PAGE_SIZE);
  const [showWhatsAppPanel, setShowWhatsAppPanel] = useState<boolean>(false);
  const [numbersText, setNumbersText] = useState<string>("");
  const [messageText, setMessageText] = useState<string>("");
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState<boolean>(false);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const [sendJobId, setSendJobId] = useState<string | null>(null);
  const [sendJobStatus, setSendJobStatus] = useState<WhatsappSendJobStatus | null>(null);

  const fetchLeads = async (
    niche: string,
    location: string,
    maxResults: number,
    append: boolean,
  ): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, location, maxResults }),
      });

      const data = (await response.json()) as ScraperResponse | ApiErrorResponse;
      if (!response.ok) {
        setLeads([]);
        setStats(null);
        setError(getErrorMessage(data, "Falha ao executar scraping."));
        return;
      }

      const successData = data as ScraperResponse;
      if (append) {
        setLeads((previous) => {
          const byPhone = new Map<string, Lead>(previous.map((lead) => [lead.phone, lead]));
          for (const lead of successData.leads) {
            byPhone.set(lead.phone, lead);
          }
          return Array.from(byPhone.values());
        });
      } else {
        setLeads(successData.leads);
      }

      setStats({
        total: append
          ? new Set([
              ...leads.map((lead) => lead.phone),
              ...successData.leads.map((lead) => lead.phone),
            ]).size
          : successData.total,
        discarded: successData.discarded,
      });
    } catch {
      setLeads([]);
      setStats(null);
      setError("Erro inesperado ao comunicar com a API.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (niche: string, location: string): Promise<void> => {
    setLastQuery({ niche, location });
    setCurrentLimit(PAGE_SIZE);
    await fetchLeads(niche, location, PAGE_SIZE, false);
  };

  const handleLoadMore = async (): Promise<void> => {
    if (!lastQuery) {
      return;
    }
    const nextLimit = currentLimit + PAGE_SIZE;
    setCurrentLimit(nextLimit);
    await fetchLeads(lastQuery.niche, lastQuery.location, nextLimit, true);
  };

  const handleDownloadCsv = (): void => {
    if (!leads.length) {
      return;
    }

    const escapeCsv = (value: string): string => `"${value.replaceAll('"', '""')}"`;
    const rows = leads.map((lead) =>
      [
        escapeCsv(lead.name),
        escapeCsv(lead.phone),
        escapeCsv(lead.websiteUrl ?? ""),
        escapeCsv(lead.googleBusinessUrl ?? ""),
        escapeCsv(lead.websiteUrl ? "Sim" : "Não"),
      ].join(","),
    );
    const csvContent = [
      "Empresa,Telefone,Site,LinkGoogleMeuNegocio,TemSite",
      ...rows,
    ].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parsedNumbers = numbersText
    .split(/[\n,;]+/)
    .map((value) => normalizePhone(value.trim()))
    .filter((value): value is string => Boolean(value));

  const handleWhatsappSend = async (): Promise<void> => {
    if (!parsedNumbers.length) {
      setWhatsappStatus("Adicione ao menos um número válido para envio.");
      return;
    }
    if (!messageText.trim()) {
      setWhatsappStatus("Escreva a mensagem antes de enviar.");
      return;
    }

    try {
      setIsSendingWhatsapp(true);
      setWhatsappStatus("Abrindo WhatsApp e iniciando disparos...");
      setSendJobStatus(null);
      setSendJobId(null);

      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numbers: parsedNumbers,
          message: messageText,
        }),
      });

      const data = (await response.json()) as WhatsappSendResponse | ApiErrorResponse;
      if (!response.ok) {
        const message = getErrorMessage(data, "Falha ao enviar mensagens.");
        setWhatsappStatus(message);
        alert(message);
        return;
      }

      const sendData = data as WhatsappSendResponse;
      setSendJobId(sendData.jobId);
      setWhatsappStatus("Envio iniciado. Acompanhe o progresso abaixo.");
    } catch {
      setWhatsappStatus("Erro inesperado ao iniciar envio no WhatsApp.");
    } finally {
      setIsSendingWhatsapp(false);
    }
  };

  useEffect(() => {
    if (!sendJobId) {
      return;
    }

    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/whatsapp/send?jobId=${encodeURIComponent(sendJobId)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as WhatsappSendJobStatus | ApiErrorResponse;
        if (!response.ok || cancelled) {
          return;
        }

        const job = data as WhatsappSendJobStatus;
        setSendJobStatus(job);
        if (job.status === "completed") {
          setWhatsappStatus(`Envio concluído: ${job.sent} enviados, ${job.failed} falhas.`);
          return;
        }
        if (job.status === "failed") {
          setWhatsappStatus(job.error ?? "Falha no envio.");
          if ((job.error ?? "").toLowerCase().includes("janela do whatsapp foi fechada")) {
            window.setTimeout(() => {
              window.location.reload();
            }, 1200);
            return;
          }
          alert(job.error ?? "Falha no envio.");
          return;
        }

        window.setTimeout(poll, 1500);
      } catch {
        if (!cancelled) {
          window.setTimeout(poll, 2000);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sendJobId]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-emerald-400" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Lead Hunter</h1>
        </div>
        <p className="text-sm text-zinc-400">
          Prospecção B2B com coleta e validação de celulares brasileiros.
        </p>
      </header>

      <SearchForm isLoading={isLoading} onSubmit={handleSearch} />

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {stats ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-200">
            {stats.total} encontrados
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-300">
            {stats.discarded} descartados (fixos/inválidos)
          </span>
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!leads.length}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar CSV
          </button>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={!lastQuery || isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {isLoading ? "Carregando..." : "Carregar mais"}
          </button>
          <button
            type="button"
            onClick={() => setShowWhatsAppPanel((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-900/40"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {showWhatsAppPanel ? "Fechar envio" : "Começar envio"}
          </button>
        </div>
      ) : null}

      <LeadsTable isLoading={isLoading} leads={leads} />

      {showWhatsAppPanel ? (
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">
              Preparação de envio no WhatsApp
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Números para disparo
              </label>
              <textarea
                value={numbersText}
                onChange={(event) => setNumbersText(event.target.value)}
                placeholder="+5541999999999 ou (41) 99999-9999, um por linha"
                className="min-h-56 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/70"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>{parsedNumbers.length} números válidos.</span>
                <button
                  type="button"
                  onClick={() => setNumbersText(leads.map((lead) => lead.phone).join("\n"))}
                  disabled={!leads.length}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Usar números dos leads
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Mensagem a ser enviada
              </label>
              <textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Escreva aqui a mensagem padrão para os contatos."
                className="min-h-56 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/70"
              />
              <p className="text-xs text-zinc-500">Prévia: {messageText.length} caracteres.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleWhatsappSend}
              disabled={
                isSendingWhatsapp ||
                !parsedNumbers.length ||
                !messageText.trim()
              }
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingWhatsapp ? "Enviando..." : "Começar envios"}
            </button>
            {whatsappStatus ? <p className="text-sm text-zinc-300">{whatsappStatus}</p> : null}
          </div>

          {sendJobStatus ? (
            <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              <p>
                Progresso:{" "}
                <span className="font-semibold text-zinc-100">
                  {Math.min(sendJobStatus.current, sendJobStatus.total)} / {sendJobStatus.total}
                </span>
              </p>
              <p>
                Enviados: <span className="text-emerald-300">{sendJobStatus.sent}</span> | Falhas:{" "}
                <span className="text-red-300">{sendJobStatus.failed}</span> | Faltam:{" "}
                <span className="text-zinc-100">{sendJobStatus.remaining}</span>
              </p>
              {sendJobStatus.waitingQrScan ? (
                <p className="text-amber-300">Aguardando leitura do QR Code...</p>
              ) : null}
              {sendJobStatus.currentPhone ? (
                <p>
                  Enviando para:{" "}
                  <span className="font-medium text-zinc-100">{sendJobStatus.currentPhone}</span>
                </p>
              ) : null}
              {sendJobStatus.error ? <p className="text-red-300">{sendJobStatus.error}</p> : null}
              <div className="max-h-28 overflow-y-auto rounded border border-zinc-800 bg-zinc-900 p-2">
                {sendJobStatus.results.filter((item) => !item.success).slice(-8).length ? (
                  sendJobStatus.results
                    .filter((item) => !item.success)
                    .slice(-8)
                    .map((item) => (
                      <p key={`${item.phone}-${item.reason ?? "erro"}`} className="text-red-200">
                        {item.phone}: {item.reason ?? "Falha sem detalhe"}
                      </p>
                    ))
                ) : (
                  <p className="text-zinc-500">Sem falhas até agora.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
