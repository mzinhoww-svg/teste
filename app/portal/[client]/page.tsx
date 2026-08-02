import Link from "next/link";
import { FileText, Receipt, FolderKanban, PackageCheck } from "lucide-react";
import { getPortalContext, getPortalProposals, getPortalInvoices, getPortalProjects, getPortalDeliverables } from "@/lib/portal-db";
import { NpsWidget } from "@/components/portal/NpsWidget";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalHome({ params }: { params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) return null;
  const base = `/portal/${ctx.slug}`;
  const [proposals, invoices, projects, deliverables] = await Promise.all([
    getPortalProposals(ctx.clientAccountId),
    getPortalInvoices(ctx.clientAccountId),
    getPortalProjects(ctx.clientAccountId),
    getPortalDeliverables(ctx.clientAccountId),
  ]);
  const openInvoices = invoices.filter((i: any) => i.status === "enviada" || i.status === "vencida");
  const openAmount = openInvoices.reduce((s: number, i: any) => s + i.amount, 0);
  const activeProjects = projects.filter((p: any) => p.status === "ativo");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Olá, {ctx.name}</h1>
        <p className="text-sm text-slate-500">Acompanhe propostas, contratos, faturas e entregas.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card href={`${base}/propostas`} icon={FileText} label="Propostas" value={String(proposals.length)} />
        <Card href={`${base}/financeiro`} icon={Receipt} label="Em aberto" value={brl(openAmount)} />
        <Card href={`${base}/projetos`} icon={FolderKanban} label="Projetos ativos" value={String(activeProjects.length)} />
        <Card href={`${base}/documentos`} icon={PackageCheck} label="Documentos" value={String(deliverables.length)} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Entregas recentes</h2>
        {deliverables.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Nada por aqui ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {deliverables.slice(0, 5).map((d: any) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate text-slate-700 dark:text-slate-200">{d.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NpsWidget slug={ctx.slug} />
    </div>
  );
}

function Card({ href, icon: Icon, label, value }: { href: string; icon: any; label: string; value: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </Link>
  );
}
