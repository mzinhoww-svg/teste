import { Nav } from "@/components/Nav";
import { agents } from "@/lib/seed";
import type { Agent } from "@/lib/types";

export const metadata = { title: "Studio de Agentes — CRM AI Studio" };

const groupMeta: Record<Agent["group"], { label: string; color: string }> = {
  aquisição: { label: "Aquisição & Qualificação", color: "text-brand-700" },
  vendas: { label: "Vendas & Negociação", color: "text-pink-700" },
  "pós-venda": { label: "Pós-venda & Sucesso do Cliente", color: "text-emerald-700" },
};

const order: Agent["group"][] = ["aquisição", "vendas", "pós-venda"];

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{agent.name}</h3>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{agent.role}</span>
        </div>
        <div className="flex items-center gap-2">
          {agent.runnable && (
            <span className="rounded-full bg-brand-100 px-2 py-1 text-[10px] font-medium text-brand-700">executável</span>
          )}
          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${agent.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {agent.enabled ? "ativo" : "inativo"}
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">{agent.description}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-rose-50/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Dores que resolve</div>
          <ul className="mt-1.5 space-y-1">
            {agent.pains.map((p, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-slate-600"><span className="text-rose-400">•</span>{p}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-emerald-50/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Atividades automatizadas</div>
          <ul className="mt-1.5 space-y-1">
            {agent.automatedActivities.map((a, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-slate-600"><span className="text-emerald-500">✓</span>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Instruções (prompt no-code)</div>
        <div className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{agent.instructions}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">Atua em:</span>
        {agent.triggers.map((t) => (
          <span key={t} className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{t}</span>
        ))}
        <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{agent.model}</span>
      </div>
    </div>
  );
}

export default function StudioPage() {
  return (
    <div className="min-h-screen">
      <Nav active="studio" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Studio de Agentes</h1>
          <p className="text-sm text-slate-500">
            Configure, no-code, os {agents.length} agentes de IA que atuam do marketing ao pós-venda. Cada agente
            resolve dores específicas e automatiza atividades. Os marcados como <em>executável</em> rodam ao vivo no funil.
          </p>
        </div>

        {order.map((g) => {
          const list = agents.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-8">
              <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide ${groupMeta[g].color}`}>{groupMeta[g].label}</h2>
              <div className="grid gap-4">
                {list.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          );
        })}

        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          <strong className="text-slate-700">IA ao vivo:</strong> defina a variável de ambiente{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> na Vercel para
          que os agentes usem o Claude API. Sem a chave, tudo funciona com heurística determinística.
        </div>
      </main>
    </div>
  );
}
