import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Coleta de eventos do site público (visitas, cliques em CTA, formulários).
// Insert anônimo é permitido pela policy `site_events_anon_insert` (0016).
// Sempre responde 204: telemetria não pode virar erro visível no site.

const KINDS = new Set(["page_view", "cta_click", "form_submit"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kind = String(body?.kind ?? "");
    if (!KINDS.has(kind)) return new NextResponse(null, { status: 204 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("placeholder")) return new NextResponse(null, { status: 204 });

    const db = createClient(url, key, { auth: { persistSession: false } });
    await db.from("site_events").insert({
      kind,
      path: String(body?.path ?? "/").slice(0, 200),
      label: body?.label ? String(body.label).slice(0, 80) : null,
    });
  } catch {
    /* silencioso por design */
  }
  return new NextResponse(null, { status: 204 });
}
