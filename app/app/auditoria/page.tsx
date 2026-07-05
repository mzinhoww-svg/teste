import Link from "next/link";
import { Nav } from "@/components/Nav";
import { PermissionDenied } from "@/components/PermissionDenied";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getAuthContext } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Auditoria de agentes — CRM AI Studio" };

export default async function AuditPage({ searchParams }: {
  searchParams: { agent?: string; via?: string; period?: string };
}) {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return null;
  if (ctx.role === "member") {
    return (
      <div className="min-h-screen">
        <Nav active="board" />
        <PermissionDenied orgName={ctx.orgName} role={ctx.role} />
      </div>
    );
  }

  const supabase = createClient();
  const agents = await getAgents();
  const period = searchParams.period === "30" ? 30 : searchParams.period === "all" ? null : 7;

  let q = supabase
    .from("agent_runs")
    .select("id, agent_kind, source, model, input, output, created_at, deal:deals(title)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (searchParams.agent) q = q.eq("agent_kind", searchParams.agent);
  if (period) q = q.gte("created_at", new Date(Date.now() - period * 86_400_000).toISOString());

  const { data: rows } = await q;
  const runs = (rows ?? []).filter((r: any) =>
    !searchParams.via || (searchParams.via === "auto" ? r.input?.via === "automation" : r.input?.via !== "automation"),
  );

  const nameByKind = new Map(agents.map((a) => [String(a.id), a.name]));
  const filterHref = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { agent: searchParams.agent, via: searchParams.via, period: searchParams.period, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/auditoria${s ? `?${s}` : ""}`;
  };

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Auditoria de agentes</h1>
          <p className="text-sm text-slate-500">
            Toda execução de IA em <strong className="text-slate-700">{ctx.orgName}</strong> — quem, quando, em qual
            deal e com qual resultado. Prompts editáveis no <Link href="/app/studio" className="text-brand-600 underline">Studio</Link>.
          </p>
        </div>

        {/* Filtros por link (persistidos na URL) */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Período:</span>
          {[["7", "7 dias"], ["30", "30 dias"], ["all", "tudo"]].map(([v, l]) => (
            <Link key={v} href={filterHref({ period: v === "7" ? undefined : v })}
              className={`rounded-full px-2.5 py-1 font-medium ${(searchParams.period ?? "7") === v || (!searchParams.period && v === "7") ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {l}
            </Link>
          ))}
          <span className="ml-3 text-slate-400">Origem:</span>
          {[["", "todas"], ["manual", "manual"], ["auto", "automação"]].map(([v, l]) => (
            <Link key={l} href={filterHref({ via: v || undefined })}
              className={`rounded-full px-2.5 py-1 font-medium ${(searchParams.via ?? "") === v ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {l}
            </Link>
          ))}
          <span className="ml-3 text-slate-400">Agente:</span>
          <Link href={filterHref({ agent: undefined })}
            className={`rounded-full px-2.5 py-1 font-medium ${!searchParams.agent ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            todos
          </Link>
          {agents.filter((a) => a.runnable).map((a) => (
            <Link key={String(a.id)} href={filterHref({ agent: String(a.id) })}
              className={`rounded-full px-2.5 py-1 font-medium ${searchParams.agent === a.id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {a.name.split(" ")[0]}
            </Link>
          ))}
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Nenhuma execução no filtro selecionado. Execute um agente em um deal do funil para começar o histórico.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Quando</th>
                  <th className="px-4 py-2.5">Agente</th>
                  <th className="px-4 py-2.5">Deal</th>
                  <th className="px-4 py-2.5">Origem</th>
                  <th className="px-4 py-2.5">Fonte</th>
                  <th className="px-4 py-2.5">Resumo do resultado</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r: any) => {
                  const out = r.output ?? {};
                  const resumo = out.reason ?? out.nextAction ?? out.headline ?? out.summary ?? out.title ?? "—";
                  return (
                    <tr key={r.id} className="border-b border-slate-50 align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{String(r.created_at).slice(0, 16).replace("T", " ")}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{nameByKind.get(r.agent_kind) ?? r.agent_kind}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.deal?.title ?? r.input?.title ?? "—"}</td>
                      <td className="px-4 py-2.5">{r.input?.via === "automation" ? <Badge variant="warning">auto</Badge> : <Badge variant="muted">manual</Badge>}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={r.source === "llm" ? "brand" : "muted"}>{r.source === "llm" ? "IA" : "heurística"}</Badge>
                      </td>
                      <td className="max-w-[320px] px-4 py-2.5 text-xs text-slate-500">
                        <span className="line-clamp-2">{String(resumo)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">Últimas 100 execuções · modelo por execução registrado em <code className="rounded bg-slate-100 px-1 font-mono">agent_runs.model</code>.</p>
      </main>
    </div>
  );
}
