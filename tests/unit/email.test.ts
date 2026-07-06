import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { emailLayout, inviteEmail, proposalEmail, contractSignEmail, invoiceEmail } from "@/lib/email/templates";
import { MockEmailProvider, BrevoProvider, getEmailProvider, hasLiveEmail } from "@/lib/email/provider";

describe("emailLayout", () => {
  it("usa a cor primária da marca no header e no CTA", () => {
    const html = emailLayout({
      brand: { primary: "#12233F" }, orgName: "Reiners Media",
      heading: "Olá", bodyHtml: "<p>corpo</p>", cta: { label: "Abrir", url: "https://x.test/a" },
    });
    expect(html).toContain("#12233F");
    expect(html).toContain("https://x.test/a");
    expect(html).toContain("Reiners Media");
  });

  it("cai no índigo padrão sem marca", () => {
    const html = emailLayout({ orgName: "CRM", heading: "h", bodyHtml: "<p>b</p>" });
    expect(html).toContain("#4f46e5");
  });

  it("escapa HTML dos dados (evita injeção)", () => {
    const html = emailLayout({ orgName: `Ma<script>lo`, heading: "h", bodyHtml: "<p>b</p>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("Ma&lt;script&gt;lo");
  });
});

describe("builders de template", () => {
  it("inviteEmail traz assunto e papel", () => {
    const { subject, html } = inviteEmail({ orgName: "Acme", inviteUrl: "https://a.test/convite/xyz", role: "admin" });
    expect(subject).toContain("Acme");
    expect(html).toContain("https://a.test/convite/xyz");
    expect(html).toContain("administrador");
  });

  it("proposalEmail formata o total em BRL quando presente", () => {
    const { html } = proposalEmail({ orgName: "Acme", dealTitle: "Podcast", total: 2190, proposalUrl: "https://a.test/proposta/t" });
    expect(html).toMatch(/R\$\s?2\.190/);
    expect(html).toContain("https://a.test/proposta/t");
  });

  it("contractSignEmail inclui referência e link de assinatura", () => {
    const { subject, html } = contractSignEmail({ orgName: "Acme", title: "Contrato X", reference: "CT-001", signUrl: "https://a.test/sign/contracts/t" });
    expect(subject).toContain("CT-001");
    expect(html).toContain("https://a.test/sign/contracts/t");
  });

  it("invoiceEmail usa o link de pagamento como CTA", () => {
    const { html } = invoiceEmail({ orgName: "Acme", number: "FAT-9", amount: 500, paymentUrl: "https://pay.test/9" });
    expect(html).toContain("https://pay.test/9");
    expect(html).toContain("Pagar fatura");
  });
});

describe("provider", () => {
  it("MockEmailProvider envia sem rede e retorna messageId", async () => {
    const r = await new MockEmailProvider().send({ to: { email: "x@y.test" }, subject: "s", html: "<p>h</p>" });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBeTruthy();
    expect(r.provider).toBe("mock");
  });

  it("BrevoProvider sem key não está configurado e falha com erro claro", async () => {
    const p = new BrevoProvider("");
    expect(p.configured).toBe(false);
    const r = await p.send({ to: { email: "x@y.test" }, subject: "s", html: "<p>h</p>" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BREVO_API_KEY/);
  });
});

describe("getEmailProvider / hasLiveEmail", () => {
  const prev = { key: process.env.BREVO_API_KEY, mode: process.env.EMAIL_PROVIDER };
  beforeEach(() => { delete process.env.BREVO_API_KEY; delete process.env.EMAIL_PROVIDER; });
  afterEach(() => {
    if (prev.key === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = prev.key;
    if (prev.mode === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = prev.mode;
  });

  it("sem BREVO_API_KEY usa o mock e hasLiveEmail é falso", () => {
    expect(getEmailProvider().name).toBe("mock");
    expect(hasLiveEmail()).toBe(false);
  });

  it("com key usa o brevo, e EMAIL_PROVIDER=mock força o mock", () => {
    process.env.BREVO_API_KEY = "xkeysib-teste";
    expect(getEmailProvider().name).toBe("brevo");
    expect(hasLiveEmail()).toBe(true);
    process.env.EMAIL_PROVIDER = "mock";
    expect(getEmailProvider().name).toBe("mock");
    expect(hasLiveEmail()).toBe(false);
  });
});
