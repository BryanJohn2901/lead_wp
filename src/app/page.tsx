"use client";

import { Crosshair, Download, Filter, MessageCircle, Pause, Play, Plus, Square, TrendingUp, Trash2, Users, Wifi } from "lucide-react";
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
  paused: boolean;
  stopRequested: boolean;
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

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: "emerald" | "amber" | "zinc" | "indigo";
}): React.JSX.Element {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber:   "bg-amber-100  text-amber-600  dark:bg-amber-500/15  dark:text-amber-400",
    zinc:    "bg-zinc-100   text-zinc-500   dark:bg-zinc-800      dark:text-zinc-400",
    indigo:  "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors[accent]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-zinc-900 dark:text-zinc-100">{value}</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
    </div>
  );
}

export default function Home(): React.JSX.Element {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; discarded: number } | null>(null);
  const [lastQuery, setLastQuery] = useState<{ niche: string; location: string } | null>(null);
  const [currentLimit, setCurrentLimit] = useState<number>(PAGE_SIZE);

  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [filterNoWebsite, setFilterNoWebsite] = useState<boolean>(false);

  const [showWhatsAppPanel, setShowWhatsAppPanel] = useState<boolean>(false);
  const [numbersText, setNumbersText] = useState<string>("");
  const [messageText, setMessageText] = useState<string>("");
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState<boolean>(false);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const [sendJobId, setSendJobId] = useState<string | null>(null);
  const [sendJobStatus, setSendJobStatus] = useState<WhatsappSendJobStatus | null>(null);

  const displayedLeads = filterNoWebsite ? leads.filter((l) => !l.hasWebsite) : leads;
  const noWebsiteCount = leads.filter((l) => !l.hasWebsite).length;

  useEffect(() => {
    if (!sendJobStatus || sendJobStatus.status !== "completed") return;
    setLeads((prev) =>
      prev.map((lead) => {
        const result = sendJobStatus.results.find((r) => r.phone === lead.phone);
        if (!result) return lead;
        return { ...lead, sentStatus: result.success ? "sent" : "failed" };
      }),
    );
  }, [sendJobStatus?.status]);

  const fetchLeads = async (niche: string, location: string, maxResults: number, append: boolean): Promise<void> => {
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
        const byPhone = new Map<string, Lead>(leads.map((lead) => [lead.phone, lead]));
        for (const lead of successData.leads) byPhone.set(lead.phone, lead);
        const mergedLeads = Array.from(byPhone.values());
        setLeads(mergedLeads);
        setStats({ total: mergedLeads.length, discarded: successData.discarded });
      } else {
        setLeads(successData.leads);
        setStats({ total: successData.total, discarded: successData.discarded });
      }
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
    setSelectedPhones(new Set());
    setFilterNoWebsite(false);
    await fetchLeads(niche, location, PAGE_SIZE, false);
  };

  const handleLoadMore = async (): Promise<void> => {
    if (!lastQuery) return;
    const nextLimit = currentLimit + PAGE_SIZE;
    setCurrentLimit(nextLimit);
    await fetchLeads(lastQuery.niche, lastQuery.location, nextLimit, true);
  };

  const handleDownloadCsv = (): void => {
    if (!leads.length) return;
    const escapeCsv = (value: string): string => `"${value.replaceAll('"', '""')}"`;
    const rows = leads.map((lead) =>
      [escapeCsv(lead.name), escapeCsv(lead.phone), escapeCsv(lead.websiteUrl ?? ""), escapeCsv(lead.googleBusinessUrl ?? ""), escapeCsv(lead.websiteUrl ? "Sim" : "Não"), escapeCsv(lead.sentStatus)].join(","),
    );
    const csvContent = ["Empresa,Telefone,Site,LinkGoogleMeuNegocio,TemSite,StatusEnvio", ...rows].join("\n");
    const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleTogglePhone = (phone: string): void => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  const handleToggleAll = (): void => {
    const displayed = displayedLeads.map((l) => l.phone);
    const allSelected = displayed.every((p) => selectedPhones.has(p));
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (allSelected) displayed.forEach((p) => next.delete(p));
      else displayed.forEach((p) => next.add(p));
      return next;
    });
  };

  const parsedNumbers = numbersText
    .split(/[\n,;]+/)
    .map((value) => normalizePhone(value.trim()))
    .filter((value): value is string => Boolean(value));

  const handleWhatsappSend = async (): Promise<void> => {
    if (!parsedNumbers.length) { setWhatsappStatus("Adicione ao menos um número válido."); return; }
    if (!messageText.trim()) { setWhatsappStatus("Escreva a mensagem antes de enviar."); return; }
    try {
      setIsSendingWhatsapp(true);
      setWhatsappStatus("Abrindo WhatsApp e iniciando disparos...");
      setSendJobStatus(null);
      setSendJobId(null);
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers: parsedNumbers, message: messageText }),
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

  const handleJobControl = async (action: "pause" | "resume" | "stop"): Promise<void> => {
    if (!sendJobId) return;
    await fetch("/api/whatsapp/send", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: sendJobId, action }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    if (!sendJobId) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/whatsapp/send?jobId=${encodeURIComponent(sendJobId)}`, { cache: "no-store" });
        const data = (await response.json()) as WhatsappSendJobStatus | ApiErrorResponse;
        if (!response.ok || cancelled) return;
        const job = data as WhatsappSendJobStatus;
        setSendJobStatus(job);
        if (job.status === "completed") { setWhatsappStatus(`Envio concluído: ${job.sent} enviados, ${job.failed} falhas.`); return; }
        if (job.status === "failed") { const msg = job.error ?? "Falha no envio."; setWhatsappStatus(msg); alert(msg); return; }
        if (!cancelled) window.setTimeout(poll, 1_500);
      } catch {
        if (!cancelled) window.setTimeout(poll, 2_000);
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [sendJobId]);

  const isJobActive = sendJobStatus?.status === "running" || sendJobStatus?.status === "pending_qr";
  const isJobPaused = sendJobStatus?.paused === true;
  const progressPct = sendJobStatus && sendJobStatus.total > 0 ? Math.min((sendJobStatus.processed / sendJobStatus.total) * 100, 100) : 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-8">

      {/* ── Header ── */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <Crosshair className="h-6 w-6 text-white" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 dark:border-zinc-950" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-zinc-900 to-zinc-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent dark:from-white dark:to-zinc-400">
              Lead Hunter
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Prospecção B2B · coleta e validação de celulares brasileiros
            </p>
          </div>
        </div>
      </header>

      {/* ── Search ── */}
      <SearchForm isLoading={isLoading} onSubmit={handleSearch} />

      {/* ── Error ── */}
      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <span className="mt-0.5 shrink-0 text-red-500">✕</span>
          {error}
        </div>
      ) : null}

      {/* ── Stats ── */}
      {stats ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Encontrados"   value={stats.total}        icon={Users}      accent="emerald" />
            <MetricCard label="Descartados"   value={stats.discarded}    icon={Trash2}     accent="zinc"    />
            <MetricCard label="Sem site"      value={noWebsiteCount}     icon={Wifi}       accent="amber"   />
            <MetricCard label="Selecionados"  value={selectedPhones.size} icon={TrendingUp} accent="indigo"  />
          </div>

          {/* ── Action bar ── */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setFilterNoWebsite((prev) => !prev); setSelectedPhones(new Set()); }}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                filterNoWebsite
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {filterNoWebsite ? `Sem site (${noWebsiteCount})` : `Filtrar sem site (${noWebsiteCount})`}
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={!leads.length}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar CSV
            </button>

            <button
              type="button"
              onClick={handleLoadMore}
              disabled={!lastQuery || isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 transition hover:from-emerald-400 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              {isLoading ? "Carregando..." : "Carregar mais"}
            </button>

            <button
              type="button"
              onClick={() => setShowWhatsAppPanel((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                showWhatsAppPanel
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {showWhatsAppPanel ? "Fechar envio" : "Começar envio"}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Table ── */}
      <LeadsTable
        isLoading={isLoading}
        leads={displayedLeads}
        selectedPhones={selectedPhones}
        onTogglePhone={handleTogglePhone}
        onToggleAll={handleToggleAll}
      />

      {/* ── WhatsApp panel ── */}
      {showWhatsAppPanel ? (
        <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
                <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Disparo via WhatsApp
              </h2>
            </div>
            {selectedPhones.size > 0 ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {selectedPhones.size} lead{selectedPhones.size !== 1 ? "s" : ""} selecionado{selectedPhones.size !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Números para disparo
              </label>
              <textarea
                value={numbersText}
                onChange={(event) => setNumbersText(event.target.value)}
                placeholder="+5541999999999 ou (41) 99999-9999, um por linha"
                className="min-h-56 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-emerald-500/70"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800 dark:text-zinc-400">
                  {parsedNumbers.length} válidos
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const phones = selectedPhones.size > 0
                      ? leads.filter((l) => selectedPhones.has(l.phone)).map((l) => l.phone)
                      : leads.map((l) => l.phone);
                    setNumbersText(phones.join("\n"));
                  }}
                  disabled={!leads.length}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {selectedPhones.size > 0 ? `Usar ${selectedPhones.size} selecionados` : "Usar todos os leads"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Mensagem a ser enviada
              </label>
              <textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Escreva aqui a mensagem padrão para os contatos."
                className="min-h-56 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-emerald-500/70"
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{messageText.length} caracteres</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleWhatsappSend}
              disabled={isSendingWhatsapp || !parsedNumbers.length || !messageText.trim() || isJobActive}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:from-emerald-400 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" />
              {isSendingWhatsapp ? "Iniciando..." : "Começar envios"}
            </button>

            {isJobActive ? (
              <button
                type="button"
                onClick={() => handleJobControl(isJobPaused ? "resume" : "pause")}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                  isJobPaused
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-300"
                }`}
              >
                {isJobPaused ? <><Play className="h-4 w-4" /> Continuar</> : <><Pause className="h-4 w-4" /> Pausar</>}
              </button>
            ) : null}

            {isJobActive ? (
              <button
                type="button"
                onClick={() => handleJobControl("stop")}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-300"
              >
                <Square className="h-4 w-4" />
                Parar
              </button>
            ) : null}

            {whatsappStatus ? (
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{whatsappStatus}</p>
            ) : null}
          </div>

          {sendJobStatus ? (
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  <span>{Math.min(sendJobStatus.current, sendJobStatus.total)} / {sendJobStatus.total} mensagens</span>
                  <span>{Math.round(progressPct)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isJobPaused ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-zinc-500">Enviados:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{sendJobStatus.sent}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-zinc-500">Falhas:</span>
                  <span className="font-bold text-red-600 dark:text-red-400">{sendJobStatus.failed}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  <span className="text-zinc-500">Restam:</span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-200">{sendJobStatus.remaining}</span>
                </span>
              </div>

              {sendJobStatus.waitingQrScan ? (
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Aguardando leitura do QR Code na janela do WhatsApp...
                </p>
              ) : null}
              {isJobPaused ? (
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Envio pausado.</p>
              ) : null}
              {sendJobStatus.currentPhone ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Enviando para: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{sendJobStatus.currentPhone}</span>
                </p>
              ) : null}
              {sendJobStatus.error ? (
                <p className="text-xs text-red-600 dark:text-red-400">{sendJobStatus.error}</p>
              ) : null}

              {sendJobStatus.results.some((r) => !r.success) ? (
                <div className="max-h-28 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                  {sendJobStatus.results
                    .filter((item) => !item.success)
                    .slice(-8)
                    .map((item) => (
                      <p key={`${item.phone}-${item.reason ?? "erro"}`} className="text-red-600 dark:text-red-400">
                        {item.phone}: {item.reason ?? "Falha sem detalhe"}
                      </p>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
