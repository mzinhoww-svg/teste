import { Nav } from "@/components/Nav";
import { PermissionDenied } from "@/components/PermissionDenied";
import { PipelineManager, type PipelineRow } from "@/components/PipelineManager";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/db";

export const metadata = { title: "Funis e estágios — CRM AI Studio" };

export default async function PipelinesPage() {
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
  const [{ data: pipes }, { data: stages }, { data: dealCounts }] = await Promise.all([
    supabase.from("pipelines").select("id,name,archived,position").eq("org_id", ctx.orgId).order("position"),
    supabase.from("stages").select("id,pipeline_id,name,position,accent,sla_days,probability,is_won,is_lost").eq("org_id", ctx.orgId).order("position"),
    supabase.from("deals").select("stage_id").eq("org_id", ctx.orgId),
  ]);

  const countByStage = new Map<string, number>();
  for (const d of dealCounts ?? []) countByStage.set(d.stage_id, (countByStage.get(d.stage_id) ?? 0) + 1);

  const pipelines: PipelineRow[] = (pipes ?? []).map((p: any) => ({
    id: p.id, name: p.name, archived: p.archived,
    stages: (stages ?? []).filter((s: any) => s.pipeline_id === p.id).map((s: any) => ({
      ...s, dealCount: countByStage.get(s.id) ?? 0,
    })),
  }));

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Funis e estágios</h1>
          <p className="text-sm text-slate-500">
            Crie, renomeie, reordene e arquive os funis de <strong className="text-slate-700">{ctx.orgName}</strong>.
            Estágios com deals ativos exigem migração antes da remoção.
          </p>
        </div>
        <PipelineManager pipelines={pipelines} orgName={ctx.orgName} />
      </main>
    </div>
  );
}
