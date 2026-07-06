// Camada de IA dos agentes — multi-provedor.
//
// Ordem de preferência:
//   1. OpenRouter (OPENROUTER_API_KEY) — usa GLM 5.2 por padrão (z-ai/glm-5.2)
//   2. Anthropic  (ANTHROPIC_API_KEY)  — usa Claude
//   3. Heurística determinística       — sem nenhuma configuração
//
// Assim o app funciona sempre; com uma chave configurada na Vercel, os agentes
// passam a raciocinar com um LLM de verdade.

import { AsyncLocalStorage } from "node:async_hooks";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Captura de uso de tokens por execução (concurrency-safe via ALS). run-agent
// envolve a execução do agente em runWithUsage e lê os tokens reais gastos.
const usageStore = new AsyncLocalStorage<{ tokens: number }>();

export async function runWithUsage<T>(fn: () => Promise<T>): Promise<{ result: T; tokens: number }> {
  const bucket = { tokens: 0 };
  const result = await usageStore.run(bucket, fn);
  return { result, tokens: bucket.tokens };
}

function addTokens(n: number) {
  const b = usageStore.getStore();
  if (b && Number.isFinite(n)) b.tokens += n;
}

export const DEFAULT_OPENROUTER_MODEL = "z-ai/glm-5.2";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

export type Provider = "openrouter" | "anthropic" | "none";

export function activeProvider(): Provider {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

export function hasLiveAI(): boolean {
  return activeProvider() !== "none";
}

/** Nome do modelo em uso (para exibição). */
export function activeModel(): string {
  const p = activeProvider();
  if (p === "openrouter") return process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  if (p === "anthropic") return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  return "heurística";
}

interface LLMOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

/**
 * Chama o provedor ativo e retorna o texto da resposta.
 * Lança em caso de erro para o chamador decidir o fallback.
 */
export async function callLLM({ system, prompt, maxTokens = 1024 }: LLMOptions): Promise<string> {
  const provider = activeProvider();
  if (provider === "openrouter") return callOpenRouter({ system, prompt, maxTokens });
  if (provider === "anthropic") return callAnthropic({ system, prompt, maxTokens });
  throw new Error("Nenhum provedor de IA configurado");
}

async function callOpenRouter({ system, prompt, maxTokens }: Required<LLMOptions>): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://crm-ai-studio.vercel.app",
      "X-Title": "CRM AI Studio",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
  addTokens(data.usage?.total_tokens ?? 0);
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function callAnthropic({ system, prompt, maxTokens }: Required<LLMOptions>): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  addTokens((data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0));
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

/**
 * Extrai um objeto JSON de um texto do modelo, de forma robusta a:
 * - blocos de raciocínio de modelos "thinking" (ex.: GLM-5.2 emite <think>…</think>
 *   com chaves que confundem um match ganancioso);
 * - cercas de código markdown (```json … ```);
 * - prosa antes/depois do JSON e múltiplos objetos (usa o ÚLTIMO objeto
 *   BALANCEADO, pois a resposta costuma vir depois do raciocínio).
 */
export function extractJson<T>(text: string): T | null {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  // 1) Tenta o texto inteiro (caso já seja JSON puro).
  try { return JSON.parse(cleaned) as T; } catch { /* continua */ }

  // 2) Varre objetos {…} balanceados e devolve o último que parsear.
  const candidates: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && start >= 0) { candidates.push(cleaned.slice(start, i + 1)); start = -1; } }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    try { return JSON.parse(candidates[i]) as T; } catch { /* tenta o anterior */ }
  }
  return null;
}
