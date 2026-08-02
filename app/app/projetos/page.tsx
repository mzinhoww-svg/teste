import { FolderKanban } from "lucide-react";
import { getClientOptions, getProjects } from "@/lib/db";
import { createProject, setProjectStatus } from "@/app/portal-actions";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Projetos — CRM AI Studio" };
export const dynamic = "force-dynamic";

const VARIANT: Record<string, "success" | "warning" | "muted" | "danger"> = {
  ativo: "success", pausado: "warning", concluido: "muted", cancelado: "danger",
};

export default async function ProjetosPage() {
  const [clients, projects] = await Promise.all([getClientOptions(), getProjects()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Projetos</h1>
        <p className="text-sm text-slate-500">Entregas em andamento por cliente.</p>
      </div>

      <form action={createProject} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="sm:col-span-2"><Label>Cliente*</Label><Select name="clientAccountId" required><option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label>Nome do projeto*</Label><Input name="name" required placeholder="Ex.: Posicionamento institucional 2026" /></div>
        <div><Label>Prazo</Label><Input name="due_date" type="date" /></div>
        <div className="sm:col-span-4"><Label>Descrição</Label><Input name="description" placeholder="opcional" /></div>
        <div className="flex items-end"><Button type="submit" className="w-full">Criar projeto</Button></div>
      </form>

      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Nenhum projeto" description="Crie o primeiro projeto para um cliente." />
      ) : (
        <Table>
          <THead><TR><TH>Projeto</TH><TH>Cliente</TH><TH>Prazo</TH><TH>Status</TH><TH>Ação</TH></TR></THead>
          <tbody>
            {projects.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{p.name}</TD>
                <TD className="text-slate-500">{p.client_name}</TD>
                <TD className="text-slate-500">{p.due_date || "—"}</TD>
                <TD><Badge variant={VARIANT[p.status] ?? "muted"}>{p.status}</Badge></TD>
                <TD>
                  {p.status !== "concluido" && (
                    <form action={setProjectStatus.bind(null, p.id, "concluido")}>
                      <Button type="submit" size="xs" variant="outline">Concluir</Button>
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
