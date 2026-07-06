import { PackageCheck, ExternalLink } from "lucide-react";
import { getPortalContext, getPortalDeliverables } from "@/lib/portal-db";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const VARIANT: Record<string, "warning" | "success" | "brand"> = { pendente: "warning", entregue: "success", aprovado: "brand" };
const TYPE_LABEL: Record<string, string> = { file: "Arquivo", link: "Link", document: "Documento", milestone: "Marco" };

export default async function PortalDocs({ params }: { params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) return null;
  const items = await getPortalDeliverables(ctx.clientAccountId);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Documentos &amp; Entregas</h1>
      {items.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nada por aqui" description="Documentos, arquivos e entregas aparecerão aqui." />
      ) : (
        <ul className="space-y-2">
          {items.map((d: any) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{d.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{TYPE_LABEL[d.type] ?? d.type}</span>
                  {d.project_name && <span>· {d.project_name}</span>}
                  <Badge variant={VARIANT[d.status] ?? "muted"}>{d.status}</Badge>
                </div>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-brand-950/40">
                  Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
