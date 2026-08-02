import { Receipt, ExternalLink } from "lucide-react";
import { getClientOptions, getInvoices } from "@/lib/db";
import { createInvoice, setInvoiceStatus } from "@/app/portal-actions";
import { brl } from "@/lib/format";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Financeiro — CRM AI Studio" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "muted" | "brand" | "success" | "warning" | "danger"> = {
  rascunho: "muted", enviada: "brand", paga: "success", vencida: "danger", cancelada: "muted",
};

export default async function FinanceiroPage() {
  const [clients, invoices] = await Promise.all([getClientOptions(), getInvoices()]);
  const receita = invoices.filter((i) => i.status === "paga").reduce((s, i) => s + i.amount, 0);
  const aberto = invoices.filter((i) => i.status === "enviada" || i.status === "vencida").reduce((s, i) => s + i.amount, 0);
  const mrr = invoices.filter((i) => i.recurring && i.status !== "cancelada").reduce((s, i) => s + i.amount, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Financeiro</h1>
        <p className="text-sm text-slate-500">Faturas, cobrança e link de pagamento (sem gateway).</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Recebido" value={brl(receita)} />
        <Kpi label="Em aberto" value={brl(aberto)} />
        <Kpi label="Recorrente (MRR)" value={brl(mrr)} />
      </div>

      <form action={createInvoice} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="sm:col-span-2"><Label>Cliente*</Label><Select name="clientAccountId" required><option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label>Descrição</Label><Input name="description" placeholder="Ex.: Mensalidade posicionamento" /></div>
        <div><Label>Valor (R$)</Label><Input name="amount" type="number" min="0" step="0.01" required /></div>
        <div><Label>Vencimento</Label><Input name="due_date" type="date" /></div>
        <div className="sm:col-span-3"><Label>Link de pagamento (Pix/Stripe/Asaas)</Label><Input name="payment_link" placeholder="https://..." /></div>
        <div><Label>Status</Label><Select name="status" defaultValue="enviada"><option value="rascunho">Rascunho</option><option value="enviada">Enviada</option><option value="paga">Paga</option></Select></div>
        <label className="flex items-end gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" name="recurring" className="h-4 w-4 accent-brand-600" /> Recorrente</label>
        <div className="flex items-end"><Button type="submit" className="w-full">Criar fatura</Button></div>
      </form>

      {invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma fatura" description="Crie a primeira fatura para um cliente." />
      ) : (
        <Table>
          <THead>
            <TR><TH>Cliente</TH><TH>Descrição</TH><TH>Valor</TH><TH>Vencimento</TH><TH>Status</TH><TH>Pagamento</TH><TH>Ação</TH></TR>
          </THead>
          <tbody>
            {invoices.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{i.client_name}</TD>
                <TD className="text-slate-500">{i.description || "—"}{i.recurring && <Badge variant="brand" className="ml-2">recorrente</Badge>}</TD>
                <TD className="tabular-nums font-semibold text-slate-800 dark:text-slate-200">{brl(i.amount)}</TD>
                <TD className="text-slate-500">{i.due_date || "—"}</TD>
                <TD><Badge variant={STATUS_VARIANT[i.status] ?? "muted"}>{i.status}</Badge></TD>
                <TD>{i.payment_link ? <a href={i.payment_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-300">link <ExternalLink className="h-3 w-3" aria-hidden /></a> : <span className="text-slate-300 dark:text-slate-600">—</span>}</TD>
                <TD>
                  {i.status !== "paga" && (
                    <form action={setInvoiceStatus.bind(null, i.id, "paga")}>
                      <Button type="submit" size="xs" variant="success">Marcar paga</Button>
                    </form>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
