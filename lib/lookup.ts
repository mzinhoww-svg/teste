import { agents, contacts, deals } from "./seed";
import type { AgentKind } from "./types";

export function findDeal(dealId: string) {
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return null;
  const contact = contacts.find((c) => c.id === deal.contactId);
  if (!contact) return null;
  return { deal, contact };
}

export function findAgent(kind: AgentKind) {
  return agents.find((a) => a.id === kind) ?? null;
}
