import { describe, it, expect } from "vitest";
import { normalizePhoneBR, waMeLink, buildWaTemplate } from "@/lib/whatsapp";

describe("normalizePhoneBR", () => {
  it("adiciona DDI 55 quando falta", () => {
    expect(normalizePhoneBR("65 99920-7108")).toBe("5565999207108");
  });
  it("mantém DDI 55 já presente", () => {
    expect(normalizePhoneBR("+55 65 99920-7108")).toBe("5565999207108");
  });
  it("remove caracteres não numéricos", () => {
    expect(normalizePhoneBR("(65) 9.9920-7108")).toBe("5565999207108");
  });
  it("retorna null para vazio", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR(null)).toBeNull();
  });
});

describe("waMeLink", () => {
  it("gera link wa.me com mensagem codificada", () => {
    const link = waMeLink("5565999207108", "Olá, tudo bem?");
    expect(link).toContain("https://wa.me/5565999207108");
    expect(link).toContain(encodeURIComponent("Olá, tudo bem?"));
  });
  it("retorna null sem telefone", () => {
    expect(waMeLink(null, "oi")).toBeNull();
  });
});

describe("buildWaTemplate", () => {
  it("preenche o template envio_proposta com o link", () => {
    const msg = buildWaTemplate("envio_proposta", { nome: "Leticia", link: "https://x/proposta/abc" });
    expect(msg).toContain("https://x/proposta/abc");
    expect(msg.length).toBeGreaterThan(0);
  });
});
