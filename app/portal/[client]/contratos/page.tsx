import { FileSignature, PenLine } from "lucide-react";
import { getPortalContext, getPortalContracts } from "@/lib/portal-db";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const VARIANT: Record<string, "success" | "warning" | "muted"> = {
  signed: "success", assinado: "success", sent: "warning", enviado: "warning",
};

export default async function PortalContracts({ params }: { params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) return null;
  const contracts = await getPortalContracts(ctx.clientAccountId);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Contratos</h1>
      {contracts.length === 0 ? (
        <EmptyState icon={FileSignature} title="Nenhum contrato" description="Seus contratos aparecerão aqui para assinatura." />
      ) : (
        <ul className="space-y-2">
          {contracts.map((c: any) => {
            const signed = c.external_status === "signed" || c.external_status === "assinado";
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.title || "Contrato"}</div>
                  <div className="mt-0.5"><Badge variant={VARIANT[c.external_status] ?? "muted"}>{c.external_status || "rascunho"}</Badge></div>
                </div>
                {c.sign_token && !signed && (
                  <a href={`/sign/contracts/${c.sign_token}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                    <PenLine className="h-3 w-3" aria-hidden /> Assinar
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
