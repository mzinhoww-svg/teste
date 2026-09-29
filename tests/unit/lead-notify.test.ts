import { describe, it, expect } from "vitest";
import {
  clientIp,
  createRateLimiter,
  isSameOrigin,
  leadEmail,
  leadFingerprint,
  leadRecipients,
  leadWhatsappDigits,
  parseLeadBody,
} from "@/lib/site/lead-notify";

const h = (init: Record<string, string>) => ({ get: (k: string) => init[k.toLowerCase()] ?? null });

describe("parseLeadBody", () => {
  it("aceita o mínimo: só o nome", () => {
    const r = parseLeadBody({ name: "Ana" });
    expect(r).toEqual({ kind: "ok", lead: { name: "Ana", email: "", phone: "", message: "" }, path: "/" });
  });

  it("limpa e normaliza o que veio", () => {
    const r = parseLeadBody({
      name: "  Ana \n Furtado ",
      email: "ana@empresa.com.br",
      phone: "(65) 99920-7108",
      message: "série mensal\r\n2 episódios",
      path: "/media",
    });
    expect(r).toMatchObject({
      kind: "ok",
      lead: { name: "Ana Furtado", message: "série mensal\n2 episódios" },
      path: "/media",
    });
  });

  it("campo-isca preenchido é robô", () => {
    expect(parseLeadBody({ name: "Ana", website: "http://spam.example" })).toEqual({ kind: "spam" });
    // Isca vazia (ou só espaços) é gente.
    expect(parseLeadBody({ name: "Ana", website: "  " }).kind).toBe("ok");
  });

  it("nome ausente ou e-mail malformado é inválido", () => {
    expect(parseLeadBody({ name: "" })).toMatchObject({ kind: "invalid", errors: { name: expect.any(String) } });
    expect(parseLeadBody({ name: "Ana", email: "oops" })).toMatchObject({
      kind: "invalid",
      errors: { email: expect.any(String) },
    });
  });

  it("corpo que não é objeto é inválido", () => {
    for (const body of [null, undefined, "texto", 42, ["Ana"]]) {
      expect(parseLeadBody(body).kind).toBe("invalid");
    }
  });

  it("path só vale se começar com barra (nada de URL externa)", () => {
    expect(parseLeadBody({ name: "Ana", path: "https://evil.example/x" })).toMatchObject({ path: "/" });
    expect(parseLeadBody({ name: "Ana", path: "/media" })).toMatchObject({ path: "/media" });
  });
});

describe("leadRecipients", () => {
  it("LEADS_NOTIFY_EMAIL manda: vários endereços, ignora os inválidos", () => {
    expect(
      leadRecipients({ LEADS_NOTIFY_EMAIL: "a@x.com; b@y.com, lixo", BREVO_REPLY_TO: "z@z.com" }),
    ).toEqual([{ email: "a@x.com" }, { email: "b@y.com" }]);
  });

  it("sem ele, usa o e-mail de resposta e depois o remetente que o CRM já usa na Brevo", () => {
    expect(leadRecipients({ BREVO_REPLY_TO: "contato@reiners.agency", BREVO_SENDER_EMAIL: "s@x.com" })).toEqual([
      { email: "contato@reiners.agency" },
    ]);
    expect(leadRecipients({ BREVO_SENDER_EMAIL: "s@x.com" })).toEqual([{ email: "s@x.com" }]);
  });

  it("valor inválido cai para a próxima fonte; sem nenhuma válida, lista vazia", () => {
    expect(leadRecipients({ LEADS_NOTIFY_EMAIL: "lixo", BREVO_REPLY_TO: "ok@x.com" })).toEqual([{ email: "ok@x.com" }]);
    expect(leadRecipients({})).toEqual([]);
    expect(leadRecipients({ LEADS_NOTIFY_EMAIL: "", BREVO_REPLY_TO: "   " })).toEqual([]);
  });

  it("no máximo 5 destinatários", () => {
    const many = Array.from({ length: 9 }, (_, i) => `p${i}@x.com`).join(",");
    expect(leadRecipients({ LEADS_NOTIFY_EMAIL: many })).toHaveLength(5);
  });
});

describe("leadWhatsappDigits", () => {
  it("assume Brasil quando vem só DDD + número", () => {
    expect(leadWhatsappDigits("(65) 99920-7108")).toBe("5565999207108");
    expect(leadWhatsappDigits("65 3322-1100")).toBe("556533221100");
  });
  it("aceita quem já digitou o DDI", () => {
    expect(leadWhatsappDigits("+55 65 99920-7108")).toBe("5565999207108");
  });
  it("fora do padrão, sem link (melhor do que um link errado)", () => {
    for (const bad of ["", "123", "+1 415 555 0100", "abc"]) expect(leadWhatsappDigits(bad)).toBe("");
  });
});

describe("leadEmail", () => {
  const lead = {
    name: "Ana Furtado",
    email: "ana@empresa.com.br",
    phone: "(65) 99920-7108",
    message: "série institucional\nmensal",
  };
  const at = new Date("2026-09-29T15:30:00Z");

  it("assunto de uma linha com o nome", () => {
    expect(leadEmail(lead, { at }).subject).toBe("Novo contato pelo site: Ana Furtado");
    // Nome já vem limpo (sem quebra de linha): o assunto nunca abre um cabeçalho novo.
    const parsed = parseLeadBody({ name: "Ana\r\nBcc: alguem@x.com" });
    expect(parsed.kind).toBe("ok");
    if (parsed.kind === "ok") expect(leadEmail(parsed.lead, { at }).subject).not.toMatch(/[\r\n]/);
  });

  it("traz os dados, o link para responder no WhatsApp e o horário de Cuiabá", () => {
    const { html } = leadEmail(lead, { at, path: "/media" });
    expect(html).toContain("Ana Furtado");
    expect(html).toContain('href="mailto:ana@empresa.com.br"');
    expect(html).toContain("https://wa.me/5565999207108");
    expect(html).toContain("+55 65 99920-7108");
    expect(html).toContain("série institucional<br>mensal");
    expect(html).toContain("/media");
    expect(html).toContain("Responder no WhatsApp");
    expect(html).toContain(encodeURIComponent("Olá, Ana!"));
    // 15:30 UTC = 11:30 em Cuiabá (UTC−4)
    expect(html).toMatch(/29\/09\/2026,? 11:30/);
  });

  it("escapa HTML: nada digitado no formulário vira marcação no e-mail da equipe", () => {
    const evil = { name: '<img src=x onerror=alert(1)>', email: "", phone: "", message: '"><script>alert(1)</script> & cia' };
    const { html } = leadEmail(evil, { at });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; cia");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("sem e-mail nem WhatsApp: avisa que só dá para retornar pela conversa", () => {
    const { html } = leadEmail({ name: "Ana", email: "", phone: "", message: "" }, { at });
    expect(html).toContain("não informado");
    expect(html).toContain("não deixou e-mail nem WhatsApp");
    expect(html).not.toContain("Responder no WhatsApp");
    expect(html).not.toContain("Responder por e-mail");
  });

  it("só e-mail: o botão vira 'Responder por e-mail'", () => {
    const { html } = leadEmail({ name: "Ana", email: "ana@x.com", phone: "", message: "" }, { at });
    expect(html).toContain("Responder por e-mail");
  });

  it("telefone fora do padrão aparece como texto, sem link de WhatsApp", () => {
    const { html } = leadEmail({ name: "Ana", email: "", phone: "123", message: "" }, { at });
    expect(html).not.toContain("wa.me/");
    expect(html).toContain("123");
  });
});

describe("proteção da rota pública", () => {
  it("só aceita chamada da própria origem (Origin = Host)", () => {
    expect(isSameOrigin(h({ origin: "https://reiners.agency", host: "reiners.agency" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "reiners.agency" }))).toBe(false);
    // Sem Origin (curl, robô simples): barrado.
    expect(isSameOrigin(h({ host: "reiners.agency" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "isto não é url", host: "reiners.agency" }))).toBe(false);
  });

  it("atrás do proxy, vale o host encaminhado", () => {
    expect(
      isSameOrigin(h({ origin: "https://reiners.agency", host: "interno.vercel.app", "x-forwarded-host": "reiners.agency" })),
    ).toBe(true);
  });

  it("clientIp", () => {
    expect(clientIp(h({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(h({}))).toBe("desconhecido");
  });

  it("limite por janela móvel", () => {
    const rl = createRateLimiter({ max: 2, windowMs: 1000 });
    expect(rl.allow("ip", 0)).toBe(true);
    expect(rl.allow("ip", 100)).toBe(true);
    expect(rl.allow("ip", 200)).toBe(false);
    // Outra chave não é afetada.
    expect(rl.allow("outro", 200)).toBe(true);
    // Passada a janela, libera de novo.
    expect(rl.allow("ip", 1201)).toBe(true);
  });

  it("mesmo envio repetido tem a mesma impressão digital (sem diferenciar maiúsculas)", () => {
    const a = leadFingerprint({ name: "Ana", email: "A@x.com", phone: "", message: "oi" });
    const b = leadFingerprint({ name: "ana", email: "a@x.com", phone: "", message: "OI" });
    const c = leadFingerprint({ name: "ana", email: "a@x.com", phone: "", message: "outra" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
