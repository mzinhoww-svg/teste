import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Dados das abas Proposta/Contratos do drawer do lead — escopado por org e deal.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const supabase = createClient();

  const [{ data: proposals }, { data: contracts }, { data: enrichment }] = await Promise.all([
    supabase.from("proposals").select("id, total, summary, share_token, approval_status, discount_pct, created_at").eq("org_id", auth.orgId).eq("deal_id", params.id).order("created_at", { ascending: false }),
    supabase.from("contracts").select("id, reference, title, value, signature_status, external_status, sign_token, certificate_url, signers:contract_signers(name, status)").eq("org_id", auth.orgId).eq("deal_id", params.id).order("created_at", { ascending: false }),
    supabase.from("lead_enrichment").select("id, source_label, extracted_fact, confidence, source_url, created_at").eq("org_id", auth.orgId).eq("deal_id", params.id).order("created_at", { ascending: false }).limit(40),
  ]);

  return NextResponse.json({
    enrichment: (enrichment ?? []).map((e: any) => ({ label: e.source_label, fact: e.extracted_fact, confidence: e.confidence, url: e.source_url })),
    proposals: (proposals ?? []).map((p: any) => ({ id: p.id, total: Number(p.total), summary: p.summary, shareToken: p.share_token, approvalStatus: p.approval_status, discountPct: Number(p.discount_pct), createdAt: p.created_at })),
    contracts: (contracts ?? []).map((c: any) => ({
      id: c.id, reference: c.reference, title: c.title, value: Number(c.value),
      status: c.signature_status, externalStatus: c.external_status, signToken: c.sign_token,
      certificateUrl: c.certificate_url,
      signed: (c.signature_status === "assinado" || ["assinado", "completed", "signed"].includes(c.external_status ?? "")),
      signers: (c.signers ?? []).map((s: any) => ({ name: s.name, status: s.status })),
    })),
  });
}
