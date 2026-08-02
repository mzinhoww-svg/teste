import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/portfolio/data";
import { isEventType } from "@/lib/portfolio/types";

// Ingestão de telemetria do catálogo. Endpoint público (a rota /portfolio é
// pública), por isso:
//   - só aceita os cinco tipos de evento conhecidos;
//   - o payload é truncado e limitado a valores primitivos, para que ninguém
//     use o EventLog como armazenamento arbitrário;
//   - responde 204 sempre que a requisição é bem formada, mesmo sem banco.

export const runtime = "nodejs";

const MAX_KEYS = 8;
const MAX_STRING = 200;

function sanitizePayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { eventType, payload } = (body ?? {}) as {
    eventType?: unknown;
    payload?: unknown;
  };

  if (!isEventType(eventType)) {
    return NextResponse.json({ error: "eventType desconhecido" }, { status: 400 });
  }

  await recordEvent(eventType, sanitizePayload(payload));
  return new NextResponse(null, { status: 204 });
}
