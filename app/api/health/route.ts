import { NextResponse } from "next/server";
import { activeModel, activeProvider, callLLM, hasLiveAI } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health            → estado da IA (chave detectada?)
// GET /api/health?probe=1    → faz uma chamada REAL ao LLM e mostra o motivo
//                              exato de eventual falha (401 chave inválida,
//                              402 sem crédito, 400 modelo inexistente, etc.).
export async function GET(req: Request) {
  const base = {
    ok: true,
    liveAI: hasLiveAI(),
    provider: activeProvider(),
    model: activeModel(),
  };

  const probe = new URL(req.url).searchParams.get("probe");
  if (probe !== "1" && probe !== "true") {
    return NextResponse.json(base);
  }

  if (!hasLiveAI()) {
    return NextResponse.json({
      ...base,
      probe: { ok: false, error: "Nenhuma chave de IA configurada (defina OPENROUTER_API_KEY ou ANTHROPIC_API_KEY na Vercel e refaça o deploy)." },
    });
  }

  const started = Date.now();
  try {
    const text = await callLLM({ system: "Você é um teste de conectividade. Responda apenas: ok", prompt: "ping", maxTokens: 5 });
    return NextResponse.json({ ...base, probe: { ok: true, ms: Date.now() - started, sample: text.slice(0, 40) } });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim().slice(0, 500);
    return NextResponse.json({ ...base, probe: { ok: false, ms: Date.now() - started, error } });
  }
}
