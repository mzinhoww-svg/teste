import { NextResponse } from "next/server";
import { activeModel, activeProvider, hasLiveAI } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    liveAI: hasLiveAI(),
    provider: activeProvider(),
    model: activeModel(),
  });
}
