import { NextResponse } from "next/server";
import { runProposal } from "@/lib/agents";
import { findAgent, findDeal } from "@/lib/lookup";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { dealId } = (await req.json()) as { dealId?: string };
  if (!dealId) return NextResponse.json({ error: "dealId obrigatório" }, { status: 400 });

  const found = findDeal(dealId);
  const agent = findAgent("proposal");
  if (!found || !agent) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const result = await runProposal(found.deal, found.contact, agent);
  return NextResponse.json(result);
}
