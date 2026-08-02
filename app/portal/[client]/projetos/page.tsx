import { FolderKanban } from "lucide-react";
import { getPortalContext, getPortalProjects } from "@/lib/portal-db";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const VARIANT: Record<string, "success" | "warning" | "muted" | "danger"> = {
  ativo: "success", pausado: "warning", concluido: "muted", cancelado: "danger",
};

export default async function PortalProjects({ params }: { params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) return null;
  const projects = await getPortalProjects(ctx.clientAccountId);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Projetos</h1>
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Nenhum projeto" description="Seus projetos aparecerão aqui." />
      ) : (
        <ul className="space-y-2">
          {projects.map((p: any) => (
            <li key={p.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                <Badge variant={VARIANT[p.status] ?? "muted"}>{p.status}</Badge>
              </div>
              {p.description && <p className="mt-1 text-xs text-slate-500">{p.description}</p>}
              {p.due_date && <p className="mt-1 text-[11px] text-slate-400">Prazo: {p.due_date}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
