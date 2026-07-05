import { Nav } from "@/components/Nav";
import { AutomationManager } from "@/components/AutomationManager";
import { getAgents, getAuthContext, getAutomations, getBoard } from "@/lib/db";
import { PermissionDenied } from "@/components/PermissionDenied";

export const metadata = { title: "Automações — CRM AI Studio" };

export default async function AutomationsPage() {
  const ctx = await getAuthContext();
  if (ctx && ctx.orgId && ctx.role === "member") {
    return (
      <div className="min-h-screen">
        <Nav active="automations" />
        <PermissionDenied orgName={ctx.orgName} role={ctx.role} />
      </div>
    );
  }
  const [automations, agents, { pipeline }] = await Promise.all([
    getAutomations(), getAgents(), getBoard(),
  ]);

  return (
    <div className="min-h-screen">
      <Nav active="automations" />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Automações</h1>
          <p className="text-sm text-slate-500">Orquestre os agentes sem clique: regras por estágio do funil.</p>
        </div>
        <AutomationManager automations={automations} stages={pipeline?.stages ?? []} agents={agents} orgName={ctx?.orgName ?? ""} />
      </main>
    </div>
  );
}
