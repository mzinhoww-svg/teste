import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, getBoard } from "@/lib/db";

export const runtime = "nodejs";

// Exporta um CSV do funil por deal (relatório operacional). Escopado à org
// ativa. Diferente de /api/export (dump LGPD em JSON), este é um CSV pronto
// para planilha com as colunas que interessam a vendas.
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const supabase = createClient();
  const { pipeline } = await getBoard();
  const stageName = new Map((pipeline?.stages ?? []).map((s) => [s.id, s.name]));

  const { data } = await supabase
    .from("deals")
    .select("title, amount, stage_id, probability, temperature, score, lost_reason, origin, created_at, updated_at")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .limit(5000);

  const header = ["Título", "Valor", "Etapa", "Probabilidade", "Temperatura", "Score", "Motivo de perda", "Origem", "Criado em", "Atualizado em"];
  const lines = [header.join(",")];
  for (const d of data ?? []) {
    lines.push([
      d.title, d.amount, stageName.get(d.stage_id ?? "") ?? "", d.probability ?? "",
      d.temperature ?? "", d.score ?? "", d.lost_reason ?? "", d.origin ?? "",
      String(d.created_at).slice(0, 10), String(d.updated_at).slice(0, 10),
    ].map(csvCell).join(","));
  }

  // BOM para o Excel reconhecer UTF-8 (acentos).
  const body = "﻿" + lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="relatorio-funil-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
