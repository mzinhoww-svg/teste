import { Nav } from "@/components/Nav";
import { AgentEditor } from "@/components/AgentEditor";
import { getAgents } from "@/lib/db";
import type { Agent } from "@/lib/types";

export const metadata = { title: "Studio de Agentes — CRM AI Studio" };

const groupMeta: Record<Agent["group"], { label: string; color: string }> = {
  aquisição: { label: "Aquisição & Qualificação", color: "text-brand-700" },
  vendas: { label: "Vendas & Negociação", color: "text-pink-700" },
  "pós-venda": { label: "Pós-venda & Sucesso do Cliente", color: "text-emerald-700" },
};
const order: Agent["group"][] = ["aquisição", "vendas", "pós-venda"];

export default async function StudioPage() {
  const agents = await getAgents();

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
        </div>

        {order.map((g) => {
          const list = agents.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-8">
              <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide ${groupMeta[g].color}`}>{groupMeta[g].label}</h2>
              <div className="grid gap-4">{list.map((a) => <AgentEditor key={a.id} agent={a} />)}</div>
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
