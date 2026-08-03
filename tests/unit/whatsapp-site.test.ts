import { describe, it, expect } from "vitest";
import {
  DEFAULT_WHATSAPP, bookingWhatsappMessage, formatWhatsappNumber,
  sanitizeWhatsappNumber, whatsappUrl,
} from "@/lib/site/whatsapp";

describe("sanitizeWhatsappNumber", () => {
  it("aceita o número em qualquer formatação", () => {
    for (const raw of ["5565999207108", "+55 65 99920-7108", "+55 (65) 99920 7108", "55-65-99920-7108"]) {
      expect(sanitizeWhatsappNumber(raw)).toBe("5565999207108");
    }
  });

  it("tolera vazio e nulo", () => {
    expect(sanitizeWhatsappNumber("")).toBe("");
    expect(sanitizeWhatsappNumber(null)).toBe("");
    expect(sanitizeWhatsappNumber(undefined)).toBe("");
  });
});

describe("formatWhatsappNumber", () => {
  it("formata celular brasileiro", () => {
    expect(formatWhatsappNumber(DEFAULT_WHATSAPP)).toBe("+55 65 99920-7108");
  });

  it("formata fixo (8 dígitos)", () => {
    expect(formatWhatsappNumber("556533334444")).toBe("+55 65 3333-4444");
  });

  it("número fora do padrão volta cru em vez de formatado errado", () => {
    expect(formatWhatsappNumber("14155552671")).toBe("+14155552671");
    expect(formatWhatsappNumber("")).toBe("");
  });
});

describe("whatsappUrl", () => {
  it("monta o wa.me com a mensagem codificada", () => {
    const url = whatsappUrl(DEFAULT_WHATSAPP, "Olá, tudo bem?");
    expect(url.startsWith("https://wa.me/5565999207108?text=")).toBe(true);
    // A mensagem tem de voltar intacta depois de decodificada.
    expect(decodeURIComponent(url.split("?text=")[1])).toBe("Olá, tudo bem?");
  });

  it("sem mensagem, devolve só o link do número", () => {
    expect(whatsappUrl("+55 65 99920-7108")).toBe("https://wa.me/5565999207108");
  });

  it("número ausente ou curto devolve vazio (o CTA some em vez de quebrar)", () => {
    expect(whatsappUrl("")).toBe("");
    expect(whatsappUrl(null)).toBe("");
    expect(whatsappUrl("12345")).toBe("");
  });
});

describe("bookingWhatsappMessage", () => {
  it("abre pela apresentação e inclui o que foi preenchido", () => {
    const msg = bookingWhatsappMessage({
      name: "Ana Furtado",
      email: "ana@sicredi.com.br",
      message: "série institucional mensal",
    });
    expect(msg).toContain("Aqui é Ana Furtado");
    expect(msg).toContain("série institucional mensal");
    expect(msg).toContain("ana@sicredi.com.br");
  });

  it("omite os campos vazios em vez de deixar rótulo órfão", () => {
    const msg = bookingWhatsappMessage({ name: "Ana" });
    expect(msg).toContain("Aqui é Ana");
    expect(msg).not.toContain("Sobre o projeto");
    expect(msg).not.toContain("Meu e-mail");
  });

  it("sem nenhum dado ainda produz mensagem válida", () => {
    expect(bookingWhatsappMessage()).toBe("Olá! Quero agendar uma sessão no estúdio.");
  });
});
