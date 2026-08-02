import { FileText, ExternalLink } from "lucide-react";
import { getPortalContext, getPortalProposals } from "@/lib/portal-db";
import { brl } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function PortalProposals({ params }: { params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) return null;
  const proposals = await getPortalProposals(ctx.clientAccountId);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Propostas</h1>
      {proposals.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhuma proposta" description="Suas propostas aparecerão aqui." />
      ) : (
        <ul className="space-y-2">
          {proposals.map((p: any) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{p.total != null ? brl(p.total) : "Proposta"}</div>
                <div className="text-xs text-slate-400">{String(p.created_at).slice(0, 10)}</div>
              </div>
              {p.share_token && (
                <a href={`/proposta/${p.share_token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-brand-950/40">
                  Ver proposta <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
