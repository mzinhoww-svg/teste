import { NextResponse } from "next/server";

export const runtime = "nodejs";

// F1.4 — Intake público multicanal (formulário/site/API). Grava em lead_inbox
// para triagem humana antes de virar deal. Autenticação simples por org + secret
// (INTAKE_SECRET), usando service role para inserir sem sessão de usuário.
//
// POST body: { org: "<org_id>", channel?, name?, email?, phone?, company?, message?, ...extra }
// Header:    x-intake-secret: <INTAKE_SECRET>
export async function POST(req: Request) {
  const secret = process.env.INTAKE_SECRET;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !service) {
    return NextResponse.json({ error: "intake não configurado (INTAKE_SECRET/SERVICE_ROLE)" }, { status: 501 });
  }
  if (req.headers.get("x-intake-secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const orgId = String(body.org ?? "").trim();
  if (!orgId) return NextResponse.json({ error: "org obrigatório" }, { status: 400 });

  const channel = ["whatsapp", "email", "form", "api"].includes(body.channel) ? body.channel : "form";
  const fromId = body.phone || body.email || null;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service);
  const { error } = await admin.from("lead_inbox").insert({
    org_id: orgId, channel, from_identifier: fromId, payload: body, status: "novo",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
