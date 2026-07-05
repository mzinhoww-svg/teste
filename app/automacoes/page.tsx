import { Nav } from "@/components/Nav";
import { AutomationManager } from "@/components/AutomationManager";
import { getAgents, getAutomations, getBoard } from "@/lib/db";

export const metadata = { title: "Automações — CRM AI Studio" };

export default async function AutomationsPage() {
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
        <AutomationManager automations={automations} stages={pipeline?.stages ?? []} agents={agents} />
      </main>
    </div>
  );
}
