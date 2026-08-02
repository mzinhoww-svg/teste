import { NextResponse } from "next/server";
import { getAuthContext, getDealTimeline } from "@/lib/db";

export const runtime = "nodejs";

// F2.1 — Timeline unificada do deal (deal_events + agent_runs + messages + notas).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const items = await getDealTimeline(params.id);
  return NextResponse.json({ items });
}
