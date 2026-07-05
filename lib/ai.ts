// Camada de IA dos agentes.
//
// Estratégia: se ANTHROPIC_API_KEY estiver presente no ambiente (ex.: configurada
// na Vercel), os agentes usam o Claude API de verdade. Caso contrário, caem num
// fallback heurístico determinístico, de modo que a demo funciona sem nenhuma
// configuração e o deploy sobe verde.

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";

export function hasLiveAI(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

interface ClaudeCallOptions {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Chama o Claude API e retorna o texto da resposta.
 * Lança em caso de erro para o chamador decidir o fallback.
 */
export async function callClaude({
  system,
  prompt,
  model = DEFAULT_MODEL,
  maxTokens = 1024,
}: ClaudeCallOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");

  const res = await fetch(API_URL, {
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

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  return text;
}

/**
 * Extrai o primeiro bloco JSON de um texto (o modelo às vezes embrulha em prosa).
 */
export function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
