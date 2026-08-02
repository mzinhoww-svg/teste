import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/ai";

describe("extractJson", () => {
  it("parseia JSON puro", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("ignora bloco <think> de modelos de raciocínio (GLM)", () => {
    const t = `<think>Vou calcular o score. { nota rascunho } acho que 80</think>\n{"score": 80, "temperature": "hot"}`;
    expect(extractJson<{ score: number }>(t)).toEqual({ score: 80, temperature: "hot" });
  });

  it("remove cercas markdown", () => {
    expect(extractJson<{ ok: boolean }>('```json\n{"ok": true}\n```')).toEqual({ ok: true });
  });

  it("pega o último objeto balanceado quando há prosa e vários objetos", () => {
    const t = 'Aqui vai: {"parcial": 1} ... resposta final: {"score": 42}';
    expect(extractJson<{ score: number }>(t)).toEqual({ score: 42 });
  });

  it("retorna null quando não há JSON válido", () => {
    expect(extractJson("sem json aqui")).toBeNull();
    expect(extractJson("{quebrado")).toBeNull();
  });
});
