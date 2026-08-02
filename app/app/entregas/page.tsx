import { PackageCheck, ExternalLink } from "lucide-react";
import { getClientOptions, getDeliverables } from "@/lib/db";
import { createDeliverable, setDeliverableStatus } from "@/app/portal-actions";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Entregas & Documentos — CRM AI Studio" };
export const dynamic = "force-dynamic";

const VARIANT: Record<string, "warning" | "success" | "brand"> = { pendente: "warning", entregue: "success", aprovado: "brand" };
const TYPE_LABEL: Record<string, string> = { file: "Arquivo", link: "Link", document: "Documento", milestone: "Marco" };

export default async function EntregasPage() {
  const [clients, items] = await Promise.all([getClientOptions(), getDeliverables()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Entregas &amp; Documentos</h1>
        <p className="text-sm text-slate-500">Arquivos, links, documentos e marcos entregues ao cliente.</p>
      </div>

      <form action={createDeliverable} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="sm:col-span-2"><Label>Cliente*</Label><Select name="clientAccountId" required><option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><Label>Tipo</Label><Select name="type" defaultValue="file"><option value="file">Arquivo</option><option value="link">Link</option><option value="document">Documento</option><option value="milestone">Marco</option></Select></div>
        <div className="sm:col-span-3"><Label>Título*</Label><Input name="title" required placeholder="Ex.: Roteiro do episódio 3" /></div>
        <div className="sm:col-span-4"><Label>URL (link/arquivo)</Label><Input name="url" placeholder="https://..." /></div>
        <div className="sm:col-span-2 flex items-end"><Button type="submit" className="w-full">Adicionar entrega</Button></div>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nenhuma entrega" description="Registre a primeira entrega ou documento para um cliente." />
      ) : (
        <Table>
          <THead><TR><TH>Título</TH><TH>Cliente</TH><TH>Tipo</TH><TH>Status</TH><TH>Link</TH><TH>Ação</TH></TR></THead>
          <tbody>
            {items.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{d.title}</TD>
                <TD className="text-slate-500">{d.client_name}</TD>
                <TD className="text-slate-500">{TYPE_LABEL[d.type] ?? d.type}</TD>
                <TD><Badge variant={VARIANT[d.status] ?? "muted"}>{d.status}</Badge></TD>
                <TD>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-300">abrir <ExternalLink className="h-3 w-3" aria-hidden /></a> : <span className="text-slate-300 dark:text-slate-600">—</span>}</TD>
                <TD>
                  {d.status === "pendente" && (
                    <form action={setDeliverableStatus.bind(null, d.id, "entregue")}>
                      <Button type="submit" size="xs" variant="outline">Marcar entregue</Button>
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
