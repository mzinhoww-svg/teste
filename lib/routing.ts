import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// F1.1 — Roteamento / distribuição de leads. Decide o dono (owner_user_id) de um
// lead novo por regra da org (routing_rules) em vez de "quem criou". Estratégias:
//   - fixed / by_segment: usa assignee_user_id da regra que casar
//   - round_robin / by_load: gira entre o `pool` (ou todos os membros), com
//     cursor em routing_state (round_robin) ou menor carga aberta (by_load).
// Sem regra aplicável → retorna null (o chamador mantém o fallback atual).

interface RoutingContext {
  segment?: string | null;
  channel?: string | null;
  clientType?: string | null;
}

function matches(match: Record<string, any>, ctx: RoutingContext): boolean {
  if (!match || Object.keys(match).length === 0) return true;
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  if (match.segment && norm(match.segment) !== norm(ctx.segment)) return false;
  if (match.channel && norm(match.channel) !== norm(ctx.channel)) return false;
  if (match.client_type && norm(match.client_type) !== norm(ctx.clientType)) return false;
  return true;
}

async function orgMemberIds(db: SupabaseClient, orgId: string): Promise<string[]> {
  const { data } = await db.from("memberships").select("user_id").eq("org_id", orgId);
  return (data ?? []).map((r: any) => r.user_id);
}

export async function resolveOwner(db: SupabaseClient, orgId: string, ctx: RoutingContext): Promise<string | null> {
  const { data: rules } = await db
    .from("routing_rules")
    .select("id, strategy, match, pool, assignee_user_id, position")
    .eq("org_id", orgId).eq("enabled", true)
    .order("position", { ascending: true });
  if (!rules?.length) return null;

  const rule = rules.find((r: any) => matches(r.match ?? {}, ctx));
  if (!rule) return null;

  if (rule.strategy === "fixed" || rule.strategy === "by_segment") {
    return rule.assignee_user_id ?? null;
  }

  const pool: string[] = (rule.pool ?? []).length ? rule.pool : await orgMemberIds(db, orgId);
  if (!pool.length) return rule.assignee_user_id ?? null;

  if (rule.strategy === "by_load") {
    // menor carga = menos deals abertos (não ganhos/perdidos) atribuídos.
    const { data: openDeals } = await db
      .from("deals")
      .select("owner_user_id, stages!inner(is_won,is_lost)")
      .eq("org_id", orgId)
      .in("owner_user_id", pool);
    const load = new Map<string, number>(pool.map((u) => [u, 0]));
    for (const d of openDeals ?? []) {
      const st: any = Array.isArray((d as any).stages) ? (d as any).stages[0] : (d as any).stages;
      if (st?.is_won || st?.is_lost) continue;
      const u = (d as any).owner_user_id;
      if (u && load.has(u)) load.set(u, (load.get(u) ?? 0) + 1);
    }
    return [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
  }

  // round_robin: próximo do pool após o último atribuído (cursor em routing_state).
  const { data: state } = await db.from("routing_state").select("last_assignee_user_id").eq("org_id", orgId).maybeSingle();
  const last = state?.last_assignee_user_id ?? null;
  const idx = last ? pool.indexOf(last) : -1;
  const next = pool[(idx + 1) % pool.length];
  await db.from("routing_state").upsert(
    { org_id: orgId, last_assignee_user_id: next, updated_at: new Date().toISOString() },
    { onConflict: "org_id" },
  );
  return next;
}
