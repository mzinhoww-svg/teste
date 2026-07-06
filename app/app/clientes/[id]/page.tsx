import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, FileSignature, FolderKanban, PackageCheck, Receipt, Users } from "lucide-react";
import { getClientAccount360 } from "@/lib/db";
import { brl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";

export const metadata = { title: "Empresa — CRM AI Studio" };
export const dynamic = "force-dynamic";

const INV_VARIANT: Record<string, "muted" | "brand" | "success" | "warning" | "danger"> = {
  rascunho: "muted", enviada: "brand", paga: "success", vencida: "danger", cancelada: "muted",
};

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const data = await getClientAccount360(params.id);
  if (!data) notFound();
  const { account, deals, contacts, invoices, projects, deliverables, totals } = data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/app/clientes" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Clientes
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"><Building2 className="h-5 w-5" aria-hidden /></span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{account.name}</h1>
            <p className="text-sm text-slate-500">
              /{account.slug}{account.cnpj ? ` · ${account.cnpj}` : ""}
              {account.portal_enabled ? <Badge variant="success" className="ml-2">portal ativo</Badge> : <Badge variant="muted" className="ml-2">portal off</Badge>}
            </p>
          </div>
        </div>
      </div>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Pipeline" value={brl(totals.pipeline)} />
        <Kpi label="Recebido" value={brl(totals.recebido)} />
        <Kpi label="A receber" value={brl(totals.aReceber)} />
        <Kpi label="Projetos" value={String(projects.length)} />
      </section>

      <Block icon={FileSignature} title="Deals" count={deals.length}>
        {deals.length === 0 ? <Empty>Nenhum deal.</Empty> : (
          <Table>
            <THead><TR><TH>Título</TH><TH>Estágio</TH><TH>Valor</TH></TR></THead>
            <tbody>{deals.map((d) => <TR key={d.id}><TD className="font-medium text-slate-800 dark:text-slate-200">{d.title}</TD><TD className="text-slate-500">{d.stage}</TD><TD className="tabular-nums">{brl(d.amount)}</TD></TR>)}</tbody>
          </Table>
        )}
      </Block>

      <Block icon={Users} title="Contatos" count={contacts.length}>
        {contacts.length === 0 ? <Empty>Nenhum contato vinculado.</Empty> : (
          <Table>
            <THead><TR><TH>Nome</TH><TH>Cargo</TH><TH>E-mail</TH><TH>Telefone</TH></TR></THead>
            <tbody>{contacts.map((c) => <TR key={c.id}><TD className="font-medium text-slate-800 dark:text-slate-200">{c.name}</TD><TD className="text-slate-500">{c.job_title || "—"}</TD><TD className="text-slate-500">{c.email || "—"}</TD><TD className="text-slate-500">{c.phone || "—"}</TD></TR>)}</tbody>
          </Table>
        )}
      </Block>

      <Block icon={Receipt} title="Faturas" count={invoices.length}>
        {invoices.length === 0 ? <Empty>Nenhuma fatura.</Empty> : (
          <Table>
            <THead><TR><TH>Número</TH><TH>Valor</TH><TH>Vencimento</TH><TH>Status</TH></TR></THead>
            <tbody>{invoices.map((i) => <TR key={i.id}><TD className="font-mono text-slate-600 dark:text-slate-300">{i.number || "—"}</TD><TD className="tabular-nums">{brl(i.amount)}</TD><TD className="text-slate-500">{i.due_date || "—"}</TD><TD><Badge variant={INV_VARIANT[i.status] ?? "muted"}>{i.status}</Badge></TD></TR>)}</tbody>
          </Table>
        )}
      </Block>

      <Block icon={FolderKanban} title="Projetos" count={projects.length}>
        {projects.length === 0 ? <Empty>Nenhum projeto.</Empty> : (
          <ul className="space-y-1.5">{projects.map((p) => <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"><span className="text-slate-800 dark:text-slate-200">{p.name}</span><span className="flex items-center gap-2 text-xs text-slate-500"><Badge variant="muted">{p.status}</Badge>{p.due_date || ""}</span></li>)}</ul>
        )}
      </Block>

      <Block icon={PackageCheck} title="Entregas & Documentos" count={deliverables.length}>
        {deliverables.length === 0 ? <Empty>Nenhuma entrega.</Empty> : (
          <ul className="space-y-1.5">{deliverables.map((d) => <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"><span className="text-slate-800 dark:text-slate-200">{d.title} <span className="text-xs text-slate-400">· {d.type}</span></span><span className="flex items-center gap-2 text-xs">{d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">abrir</a>}<Badge variant={d.status === "aprovado" ? "success" : d.status === "entregue" ? "brand" : "muted"}>{d.status}</Badge></span></li>)}</ul>
        )}
      </Block>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function Block({ icon: Icon, title, count, children }: { icon: any; title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        <Icon className="h-4 w-4 text-slate-400" aria-hidden /> {title} <span className="text-slate-400">· {count}</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400 dark:border-slate-800">{children}</p>;
}
