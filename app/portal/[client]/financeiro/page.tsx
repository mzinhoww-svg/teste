import { Receipt, ExternalLink } from "lucide-react";
import { getPortalContext, getPortalInvoices } from "@/lib/portal-db";
import { brl } from "@/lib/format";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const VARIANT: Record<string, "muted" | "brand" | "success" | "danger"> = {
  rascunho: "muted", enviada: "brand", paga: "success", vencida: "danger", cancelada: "muted",
};

export default async function PortalFinance({ params }: { params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) return null;
  const invoices = (await getPortalInvoices(ctx.clientAccountId)).filter((i: any) => i.status !== "rascunho");

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Financeiro</h1>
      {invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma fatura" description="Suas faturas aparecerão aqui." />
      ) : (
        <Table>
          <THead><TR><TH>Descrição</TH><TH>Valor</TH><TH>Vencimento</TH><TH>Status</TH><TH>Pagar</TH></TR></THead>
          <tbody>
            {invoices.map((i: any) => (
              <TR key={i.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{i.description || i.number || "Fatura"}</TD>
                <TD className="tabular-nums font-semibold">{brl(i.amount)}</TD>
                <TD className="text-slate-500">{i.due_date || "—"}</TD>
                <TD><Badge variant={VARIANT[i.status] ?? "muted"}>{i.status}</Badge></TD>
                <TD>
                  {i.payment_link && i.status !== "paga" ? (
                    <a href={i.payment_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                      Pagar <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
