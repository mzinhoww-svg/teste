import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getSignatureProvider } from "@/lib/signature/provider";

export const runtime = "nodejs";

// Webhook do OpenSign — atualiza o status do contrato pelo envelope_id.
// Valida o segredo compartilhado no provider. Usa service role quando presente
// (webhook não tem sessão de usuário); sem ela, degrada e apenas loga.
export async function POST(req: Request) {
  const raw = await req.text();
  const provider = getSignatureProvider();
  const v = provider.verifyWebhook(raw, req.headers);
  if (!v.valid || !v.envelopeId) {
    return NextResponse.json({ error: "assinatura de webhook inválida" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // Sem service role não dá para escrever ignorando RLS; documenta a pendência.
    return NextResponse.json({ ok: true, note: "recebido, mas SUPABASE_SERVICE_ROLE_KEY não configurada — status não persistido", envelopeId: v.envelopeId });
  }

  const admin = createAdminClient(url, serviceKey);
  const localMap: Record<string, string> = {
    enviado: "enviado", visualizado: "enviado", assinado: "assinado", recusado: "cancelado", expirado: "cancelado", erro: "enviado",
  };
  const local = localMap[v.status ?? "enviado"] ?? "enviado";

  const { data: contract } = await admin.from("contracts").select("id, org_id, reference, deal_id").eq("envelope_id", v.envelopeId).maybeSingle();
  if (!contract) return NextResponse.json({ ok: true, note: "envelope sem contrato correspondente" });

  await admin.from("contracts").update({
    external_status: v.status, signature_status: local, certificate_url: v.certificateUrl ?? null,
    signed_at: v.status === "assinado" ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq("id", contract.id);

  const titleByStatus: Record<string, string> = {
    assinado: "Contrato assinado", recusado: "Contrato recusado", expirado: "Contrato expirado", visualizado: "Contrato visualizado",
  };
  if (titleByStatus[v.status ?? ""]) {
    await admin.from("notifications").insert({
      org_id: contract.org_id, type: v.status === "assinado" ? "contract_signed" : "contract",
      title: titleByStatus[v.status!], body: `${contract.reference}: ${v.status}.`,
      contract_id: contract.id, deal_id: contract.deal_id, action_url: "/app/contracts",
    });
  }

  return NextResponse.json({ ok: true, envelopeId: v.envelopeId, status: v.status });
}
