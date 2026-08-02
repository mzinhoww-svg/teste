import { NextResponse } from "next/server";
import { listEvents } from "@/lib/portfolio/data";
import { getPortfolioSession } from "@/lib/portfolio/auth";
import { isEventType } from "@/lib/portfolio/types";

// Export CSV do EventLog. Restrito ao admin do catálogo — o middleware já exige
// login para /api/portfolio/analytics/*, mas o papel é conferido aqui.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/** Escapa um campo para CSV (RFC 4180) e neutraliza fórmulas de planilha. */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // Um valor começando com = + - @ é interpretado como fórmula pelo Excel.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getPortfolioSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const events = await listEvents({
    eventType: isEventType(typeParam) ? typeParam : undefined,
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
    take: MAX_ROWS,
  });

  const lines = [
    ["id", "eventType", "createdAt", "payload"].map(csvCell).join(","),
    ...events.map((e) =>
      [e.id, e.eventType, e.createdAt, e.payload ? JSON.stringify(e.payload) : ""]
        .map(csvCell)
        .join(","),
    ),
  ];

  // BOM para o Excel abrir UTF-8 corretamente.
  const csv = `﻿${lines.join("\r\n")}`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portfolio-eventos-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
