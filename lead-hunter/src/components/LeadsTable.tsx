import { Inbox } from "lucide-react";
import type { Lead } from "@/types/lead";

interface LeadsTableProps {
  leads: Lead[];
  isLoading: boolean;
}

export function LeadsTable({
  leads,
  isLoading,
}: LeadsTableProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`skeleton-${index.toString()}`}
              className="h-12 animate-pulse rounded-lg bg-zinc-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 text-center">
        <Inbox className="h-7 w-7 text-zinc-500" />
        <p className="text-sm text-zinc-400">Nenhuma busca executada ainda</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Empresa</th>
            <th className="px-4 py-3 text-left font-medium">Telefone</th>
            <th className="px-4 py-3 text-left font-medium">Site</th>
            <th className="px-4 py-3 text-left font-medium">Google Meu Negócio</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, index) => (
            <tr
              key={`${lead.name}-${lead.phone}`}
              className={`border-t border-zinc-800 transition hover:bg-zinc-800/40 ${
                index % 2 === 0 ? "bg-transparent" : "bg-zinc-900/60"
              }`}
            >
              <td className="px-4 py-3 text-zinc-100">{lead.name}</td>
              <td className="px-4 py-3 text-zinc-300">{lead.phone}</td>
              <td className="px-4 py-3">
                {lead.websiteUrl ? (
                  <a
                    href={lead.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 underline decoration-zinc-700 underline-offset-4 hover:text-emerald-300"
                  >
                    Abrir site
                  </a>
                ) : (
                  <span className="text-zinc-500">Não tem</span>
                )}
              </td>
              <td className="px-4 py-3">
                {lead.googleBusinessUrl ? (
                  <a
                    href={lead.googleBusinessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 underline decoration-zinc-700 underline-offset-4 hover:text-indigo-300"
                  >
                    Abrir no Google
                  </a>
                ) : (
                  <span className="text-zinc-500">Não encontrado</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
