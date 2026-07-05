import { NextResponse } from "next/server";
import { runContract } from "@/lib/agents";
import { findAgent, findDeal } from "@/lib/lookup";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { dealId } = (await req.json()) as { dealId?: string };
  if (!dealId) return NextResponse.json({ error: "dealId obrigatório" }, { status: 400 });

  const found = findDeal(dealId);
  const agent = findAgent("legal-contract");
  if (!found || !agent) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const result = await runContract(found.deal, found.contact, agent);
  return NextResponse.json(result);
}
