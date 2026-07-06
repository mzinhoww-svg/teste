import { Building2, Link2 } from "lucide-react";
import { getAuthContext, getClientAccounts, getClientInvites } from "@/lib/db";
import { createClientAccount, createClientInvite, toggleClientPortal } from "@/app/portal-actions";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { clientInviteUrl } from "@/lib/urls";

export const metadata = { title: "Clientes — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [ctx, clients, invites] = await Promise.all([getAuthContext(), getClientAccounts(), getClientInvites()]);
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Clientes</h1>
        <p className="text-sm text-slate-500">Empresas atendidas e o acesso delas ao portal.</p>
      </div>

      {canManage && (
        <form action={createClientAccount} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
          <div><Label>Nome do cliente*</Label><Input name="name" required placeholder="Ex.: Biglar" /></div>
          <div><Label>Slug (portal)</Label><Input name="slug" placeholder="biglar" /></div>
          <div><Label>CNPJ</Label><Input name="cnpj" placeholder="opcional" /></div>
          <div className="flex items-end"><Button type="submit" className="w-full">Adicionar cliente</Button></div>
        </form>
      )}

      {clients.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum cliente" description="Cadastre o primeiro cliente para habilitar o portal dele." />
      ) : (
        <Table>
          <THead>
            <TR><TH>Cliente</TH><TH>Slug</TH><TH>Deals</TH><TH>Faturas</TH><TH>Usuários</TH><TH>Portal</TH><TH>Convidar</TH></TR>
          </THead>
          <tbody>
            {clients.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{c.name}</TD>
                <TD><Badge variant="outline">{c.slug}</Badge></TD>
                <TD className="tabular-nums">{c.deals}</TD>
                <TD className="tabular-nums">{c.invoices}</TD>
                <TD className="tabular-nums">{c.users}</TD>
                <TD>
                  {canManage ? (
                    <form action={toggleClientPortal.bind(null, c.id, !c.portal_enabled)}>
                      <button className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.portal_enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                        {c.portal_enabled ? "Ativo" : "Desativado"}
                      </button>
                    </form>
                  ) : (
                    <Badge variant={c.portal_enabled ? "success" : "muted"}>{c.portal_enabled ? "Ativo" : "Off"}</Badge>
                  )}
                </TD>
                <TD>
                  {canManage && (
                    <form action={createClientInvite} className="flex items-center gap-1.5">
                      <input type="hidden" name="clientAccountId" value={c.id} />
                      <Input name="email" type="email" required placeholder="email@cliente.com" className="h-8 w-40 text-xs" />
                      <Button type="submit" size="sm" variant="outline">Convidar</Button>
                    </form>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {invites.length > 0 && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200"><Link2 className="h-4 w-4" aria-hidden /> Convites do portal pendentes</h2>
          <ul className="space-y-1.5 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 py-1.5 last:border-0 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300">{i.email} · <span className="text-slate-400">{i.client_name}</span></span>
                <code className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{clientInviteUrl(i.token)}</code>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Envie o link ao cliente (sem e-mail transacional). Ele cria a senha e acessa o portal.</p>
        </section>
      )}
    </main>
  );
}
