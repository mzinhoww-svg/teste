import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Formulário "Agendar sessão" da landing. Insert anônimo liberado pela policy
// `site_leads_anon_insert` (0016); a leitura fica restrita a editores do site.
// Validação server-side — o cliente valida também, mas não é a fonte da verdade.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const message = String(body.message ?? "").trim();

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Informe seu nome.";
  if (!EMAIL.test(email)) errors.email = "Informe um e-mail válido.";
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("placeholder")) {
    // Ambiente sem banco (dev/E2E): aceita o envio para não travar o fluxo,
    // mas diz claramente que não foi persistido.
    return NextResponse.json({ ok: true, persisted: false });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from("site_leads").insert({
    name: name.slice(0, 120),
    email: email.slice(0, 160),
    phone: phone.slice(0, 40) || null,
    message: message.slice(0, 2000) || null,
    source: "landing",
  });

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível registrar agora. Tente de novo em instantes." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, persisted: true });
}
