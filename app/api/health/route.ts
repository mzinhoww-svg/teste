import { NextResponse } from "next/server";
import { hasLiveAI } from "@/lib/ai";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, liveAI: hasLiveAI() });
}
