import { Users } from "lucide-react";
import { getAuthContext, getContactsList } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ContactRowMenu } from "@/components/ContactRowMenu";

export const metadata = { title: "Contatos — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function ContatosPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? "";
  const [contacts, ctx] = await Promise.all([getContactsList(q), getAuthContext()]);
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";
  const candidates = contacts.map((c) => ({ id: c.id, name: c.name, company: c.company }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Contatos</h1>
        <p className="text-sm text-slate-500">Pessoas e empresas do seu CRM.</p>
      </div>

      <form className="mb-4 max-w-sm">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, empresa ou e-mail" aria-label="Buscar contatos" />
      </form>

      {contacts.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum contato" description={q ? "Nada encontrado para a busca." : "Os contatos aparecem aqui conforme você cria leads."} />
      ) : (
        <Table>
          <THead>
            <TR><TH>Nome</TH><TH>Empresa</TH><TH>Cargo</TH><TH>E-mail</TH><TH>Telefone</TH><TH>Cidade</TH>{canManage && <TH>Ações</TH>}</TR>
          </THead>
          <tbody>
            {contacts.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{c.name}</TD>
                <TD>{c.company || <span className="text-slate-300 dark:text-slate-600">—</span>}</TD>
                <TD className="text-slate-500">{c.job_title || "—"}</TD>
                <TD className="text-slate-500">{c.email || "—"}</TD>
                <TD className="text-slate-500">{c.phone || "—"}</TD>
                <TD className="text-slate-500">{c.city || "—"}</TD>
                {canManage && <TD><ContactRowMenu contactId={c.id} candidates={candidates} /></TD>}
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}
