import Link from "next/link";
import { Nav } from "@/components/Nav";
import { StudioAgentCard } from "@/components/StudioAgentCard";
import { getAuthContext } from "@/lib/db";
import { resolveAllAgents } from "@/lib/agents/resolve";
import { PermissionDenied } from "@/components/PermissionDenied";

export const metadata = { title: "Studio de Agentes — CRM AI Studio" };

const groupMeta: Record<string, { label: string; color: string }> = {
  "aquisição": { label: "Aquisição & Qualificação", color: "text-brand-700" },
  "vendas": { label: "Vendas & Negociação", color: "text-pink-700" },
  "pós-venda": { label: "Pós-venda & Sucesso do Cliente", color: "text-emerald-700" },
};
const order = ["aquisição", "vendas", "pós-venda"];

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
  const agents = await resolveAllAgents(ctx?.orgId ?? null);
  const overridesEnabled = process.env.ALLOW_TENANT_AGENT_OVERRIDES === "true";

  return (
    <div className="min-h-screen">
      <Nav active="studio" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Studio de Agentes</h1>
          <p className="text-sm text-slate-500">
            Os {agents.length} agentes seguem o <strong>padrão da plataforma</strong> e já vêm refinados para o seu
            case. O contexto da empresa e a camada de enriquecimento são aplicados automaticamente em cada execução.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
            {overridesEnabled
              ? "Overrides por tenant estão habilitados nesta instância."
              : "A edição do padrão é feita pelo administrador da plataforma."}
            <Link href="/admin/agents" className="underline">Abrir agentes da plataforma →</Link>
          </p>
        </div>

        {order.map((g) => {
          const list = agents.filter((a) => a.category === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-8">
              <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide ${groupMeta[g].color}`}>{groupMeta[g].label}</h2>
              <div className="grid gap-4">{list.map((a) => <StudioAgentCard key={a.key} agent={a} />)}</div>
            </section>
          );
        })}

        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          <strong className="text-slate-700">IA ao vivo:</strong> rodam no{" "}
          <strong className="text-slate-700">GLM 5.2</strong> via OpenRouter (env <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">OPENROUTER_API_KEY</code>). Sem a chave, usam heurística.
        </div>
      </main>
    </div>
  );
}
