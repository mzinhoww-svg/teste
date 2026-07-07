import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// F1.3 — Tarefas com estado (tabela `tasks`), separadas da timeline (activities).
// Helper usado pela esteira, agentes e server actions. Registra o evento de
// negócio na timeline unificada (deal_events) quando ligado a um deal.

export interface CreateTaskInput {
  orgId: string;
  title: string;
  dealId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
  dueAt?: string | null; // ISO
  priority?: "baixa" | "normal" | "alta" | "urgente";
  source?: "manual" | "agent" | "cadence" | "esteira";
  agentKind?: string | null;
  createdBy?: string | null;
  notes?: string | null;
}

export async function createTask(db: SupabaseClient, input: CreateTaskInput): Promise<string | null> {
  const { data, error } = await db.from("tasks").insert({
    org_id: input.orgId,
    title: input.title.slice(0, 280),
    deal_id: input.dealId ?? null,
    contact_id: input.contactId ?? null,
    assignee_user_id: input.assigneeUserId ?? null,
    due_at: input.dueAt ?? null,
    priority: input.priority ?? "normal",
    source: input.source ?? "manual",
    agent_kind: input.agentKind ?? null,
    created_by: input.createdBy ?? null,
    notes: input.notes ?? null,
  }).select("id").maybeSingle();
  if (error) return null;
  if (data?.id && input.dealId) {
    await db.rpc("log_deal_event", { p_deal_id: input.dealId, p_kind: "task_created", p_data: { title: input.title, source: input.source ?? "manual" } });
  }
  return data?.id ?? null;
}
