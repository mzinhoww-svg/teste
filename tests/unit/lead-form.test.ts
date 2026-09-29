import { describe, it, expect } from "vitest";
import { LEAD_LIMITS, cleanLead, cleanLine, cleanText, isEmail, validateLead } from "@/lib/site/lead-form";
import { BOOKING_PROJECT_MAX, bookingWhatsappMessage } from "@/lib/site/whatsapp";

describe("limpeza dos campos do formulário", () => {
  it("campo de uma linha: sem quebra de linha, sem controle, espaços colapsados", () => {
    expect(cleanLine("  Ana \n\r Furtado\t ", 80)).toBe("Ana Furtado");
    // Quebra de linha em nome/e-mail é o caminho de injeção de cabeçalho em e-mail.
    expect(cleanLine("ana@x.com\r\nBcc: alguem@x.com", 120)).toBe("ana@x.com Bcc: alguem@x.com");
    expect(cleanLine("a\u0000b\u001fc\u2028d", 80)).toBe("a b c d");
  });

  it("corta no tamanho máximo", () => {
    expect(cleanLine("x".repeat(500), LEAD_LIMITS.name)).toHaveLength(LEAD_LIMITS.name);
    expect(cleanText("y".repeat(5000), LEAD_LIMITS.message)).toHaveLength(LEAD_LIMITS.message);
  });

  it("texto livre mantém as quebras de linha (no máximo duas seguidas) e tira controle", () => {
    expect(cleanText("linha 1\r\nlinha 2\n\n\n\nlinha 3", 600)).toBe("linha 1\nlinha 2\n\nlinha 3");
    expect(cleanText("a\u0000b\tc", 600)).toBe("a b c");
    expect(cleanText("  fim com espaço   \n", 600)).toBe("fim com espaço");
  });

  it("tolera valores que não são texto (corpo adulterado)", () => {
    expect(cleanLead({ name: 42, email: null, phone: undefined, message: { x: 1 } })).toEqual({
      name: "42",
      email: "",
      phone: "",
      message: "[object Object]",
    });
  });
});

describe("validação: só o nome é obrigatório", () => {
  const ok = { name: "Ana", email: "", phone: "", message: "" };

  it("nome com 2+ letras basta — e-mail, WhatsApp e projeto são opcionais", () => {
    expect(validateLead(ok)).toEqual({});
    expect(validateLead({ ...ok, name: "Jo" })).toEqual({});
  });

  it("sem nome, ou com uma letra só, não passa", () => {
    expect(validateLead({ ...ok, name: "" }).name).toBeTruthy();
    expect(validateLead({ ...ok, name: "A" }).name).toBeTruthy();
  });

  it("o e-mail só é conferido se preenchido", () => {
    expect(validateLead({ ...ok, email: "" })).toEqual({});
    expect(validateLead({ ...ok, email: "ana@empresa.com.br" })).toEqual({});
    expect(validateLead({ ...ok, email: "nao-e-email" }).email).toBeTruthy();
    expect(validateLead({ ...ok, email: "ana@empresa" }).email).toBeTruthy();
  });

  it("isEmail", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a b@c.com")).toBe(false);
    expect(isEmail("@c.com")).toBe(false);
  });
});

describe("a mensagem pronta do WhatsApp respeita o teto do formulário", () => {
  it("o teto é o mesmo nos dois lados (campo e mensagem)", () => {
    expect(BOOKING_PROJECT_MAX).toBe(LEAD_LIMITS.message);
  });

  it("projeto enorme não quebra o link: a mensagem corta no teto", () => {
    const msg = bookingWhatsappMessage({ name: "Ana", message: "z".repeat(5000) });
    const project = msg.split("Sobre o projeto: ")[1] ?? "";
    expect(project).toHaveLength(BOOKING_PROJECT_MAX);
  });
});
