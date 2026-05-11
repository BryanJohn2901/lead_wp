import { Inbox } from "lucide-react";
import type { Lead } from "@/types/lead";

interface LeadsTableProps {
  leads: Lead[];
  isLoading: boolean;
  selectedPhones: ReadonlySet<string>;
  onTogglePhone: (phone: string) => void;
  onToggleAll: () => void;
}

function StatusBadge({ status }: { status: Lead["sentStatus"] }): React.JSX.Element {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Enviado
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Falhou
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
      Pendente
    </span>
  );
}

function CompanyAvatar({ name }: { name: string }): React.JSX.Element {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const colors = [
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400",
    "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];

  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${color}`}>
      {initials || "?"}
    </div>
  );
}

export function LeadsTable({
  leads,
  isLoading,
  selectedPhones,
  onTogglePhone,
  onToggleAll,
}: LeadsTableProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
        <div className="space-y-px p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`skeleton-${index.toString()}`}
              className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
              style={{ animationDelay: `${index * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-200 bg-white text-center dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
          <Inbox className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nenhum lead ainda</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Execute uma busca para começar a coletar leads</p>
        </div>
      </div>
    );
  }

  const allSelected = leads.length > 0 && leads.every((l) => selectedPhones.has(l.phone));
  const someSelected = !allSelected && leads.some((l) => selectedPhones.has(l.phone));
  const hasSentAny = leads.some((l) => l.sentStatus !== "pending");

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={onToggleAll}
                  className="h-4 w-4 cursor-pointer accent-emerald-500"
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold">Empresa</th>
              <th className="px-4 py-3 text-left font-semibold">Telefone</th>
              <th className="px-4 py-3 text-left font-semibold">Site</th>
              <th className="px-4 py-3 text-left font-semibold">Google Meu Negócio</th>
              {hasSentAny ? <th className="px-4 py-3 text-left font-semibold">Envio</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {leads.map((lead) => {
              const isSelected = selectedPhones.has(lead.phone);
              return (
                <tr
                  key={`${lead.name}-${lead.phone}`}
                  onClick={() => onTogglePhone(lead.phone)}
                  className={`cursor-pointer transition-colors duration-100 ${
                    isSelected
                      ? "bg-emerald-50 dark:bg-emerald-900/10"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onTogglePhone(lead.phone)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer accent-emerald-500"
                      aria-label={`Selecionar ${lead.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CompanyAvatar name={lead.name} />
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{lead.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {lead.phone}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.websiteUrl ? (
                      <a
                        href={lead.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                      >
                        Abrir site ↗
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">Não tem</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.googleBusinessUrl ? (
                      <a
                        href={lead.googleBusinessUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-700/40 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                      >
                        Ver no Google ↗
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">Não encontrado</span>
                    )}
                  </td>
                  {hasSentAny ? (
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.sentStatus} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
