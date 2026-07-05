import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/db";
import { RateLimitError, runAgentForDeal } from "@/lib/run-agent";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { dealId, kind } = (await req.json()) as { dealId?: string; kind?: string };
  if (!dealId || !kind) return NextResponse.json({ error: "dealId e kind obrigatórios" }, { status: 400 });

  try {
    const result = await runAgentForDeal(kind, dealId, { orgId: auth.orgId, userId: auth.userId, via: "manual" });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
    const msg = e instanceof Error ? e.message : "erro ao executar agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
