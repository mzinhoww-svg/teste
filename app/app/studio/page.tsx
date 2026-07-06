import { Nav } from "@/components/Nav";
import { AgentEditor } from "@/components/AgentEditor";
import { getAgents, getAgentVersions, getAuthContext } from "@/lib/db";
import type { AgentVersion } from "@/lib/db";
import { PermissionDenied } from "@/components/PermissionDenied";
import type { Agent } from "@/lib/types";

export const metadata = { title: "Studio de Agentes — CRM AI Studio" };

const groupMeta: Record<Agent["group"], { label: string; color: string }> = {
  aquisição: { label: "Aquisição & Qualificação", color: "text-brand-700" },
  vendas: { label: "Vendas & Negociação", color: "text-pink-700" },
  "pós-venda": { label: "Pós-venda & Sucesso do Cliente", color: "text-emerald-700" },
};
const order: Agent["group"][] = ["aquisição", "vendas", "pós-venda"];

export default async function StudioPage() {
  const ctx = await getAuthContext();
  if (ctx && ctx.orgId && ctx.role === "member") {
    return (
      <div className="min-h-screen">
        <Nav active="studio" />
        <PermissionDenied orgName={ctx.orgName} role={ctx.role} />
      </div>
    );
  }
  const agents = await getAgents();
  const versionLists = await Promise.all(
    agents.map((a) => (a.uuid ? getAgentVersions(a.uuid) : Promise.resolve([] as AgentVersion[]))),
  );
  const versionsById = new Map<string, AgentVersion[]>();
  agents.forEach((a, i) => { if (a.uuid) versionsById.set(a.uuid, versionLists[i]); });

  return (
    <div className="min-h-screen">
      <Nav active="studio" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Studio de Agentes</h1>
          <p className="text-sm text-slate-500">
            Edite, no-code, os {agents.length} agentes que atuam do marketing ao pós-venda. Alterações são salvas por
            organização e o prompt anterior fica versionado.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
            As alterações feitas aqui afetam toda a organização {ctx?.orgName ? `"${ctx.orgName}"` : "ativa"} — todos os
            deals passam a usar os agentes como configurados.
          </p>
        </div>

        {order.map((g) => {
          const list = agents.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-8">
              <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide ${groupMeta[g].color}`}>{groupMeta[g].label}</h2>
              <div className="grid gap-4">{list.map((a) => <AgentEditor key={a.id} agent={a} orgName={ctx?.orgName ?? ""} versions={a.uuid ? versionsById.get(a.uuid) ?? [] : []} />)}</div>
            </section>
          );
        })}

        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          <strong className="text-slate-700">IA ao vivo:</strong> os agentes executáveis rodam no{" "}
          <strong className="text-slate-700">GLM 5.2</strong> via OpenRouter (env <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">OPENROUTER_API_KEY</code>). Sem a chave, usam heurística.
        </div>
      </main>
    </div>
  );
}
