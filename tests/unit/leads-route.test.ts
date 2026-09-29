import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A rota de aviso do formulário: valida, protege e manda o e-mail pela Brevo.
// O provider é trocado por um falso — nenhum teste faz rede nem grava em banco.

const send = vi.fn();
let providerName = "brevo";
vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: () => ({ name: providerName, configured: true, send }),
}));

// Módulo novo a cada teste: os limites (por IP, repetição) vivem na memória do módulo.
async function loadPost() {
  vi.resetModules();
  const mod = await import("@/app/api/site/leads/route");
  return mod.POST;
}

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  origin: "https://reiners.agency",
  host: "reiners.agency",
  "x-real-ip": "203.0.113.7",
};

function req(body: unknown, headers: Record<string, string | null> = {}) {
  const merged: Record<string, string> = { ...BASE_HEADERS };
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  return new Request("https://reiners.agency/api/site/leads", {
    method: "POST",
    headers: merged,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const LEAD = {
  name: "Ana Furtado",
  email: "ana@empresa.com.br",
  phone: "(65) 99920-7108",
  message: "série institucional mensal",
  path: "/",
};

beforeEach(() => {
  providerName = "brevo";
  send.mockReset();
  send.mockResolvedValue({ provider: "brevo", ok: true, messageId: "m1" });
  vi.stubEnv("LEADS_NOTIFY_EMAIL", "equipe@reiners.agency");
  vi.stubEnv("BREVO_REPLY_TO", "");
  vi.stubEnv("BREVO_SENDER_EMAIL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/site/leads", () => {
  it("valida, manda o e-mail pela Brevo e responde 202", async () => {
    const POST = await loadPost();
    const res = await POST(req(LEAD));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, notified: true });

    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual([{ email: "equipe@reiners.agency" }]);
    expect(mail.subject).toBe("Novo contato pelo site: Ana Furtado");
    expect(mail.html).toContain("Ana Furtado");
    expect(mail.html).toContain("https://wa.me/5565999207108");
    // Responder o aviso fala direto com a pessoa.
    expect(mail.replyTo).toEqual({ email: "ana@empresa.com.br", name: "Ana Furtado" });
    expect(mail.tags).toEqual(["site-lead"]);
  });

  it("sem e-mail da pessoa, não define Reply-To", async () => {
    const POST = await loadPost();
    await POST(req({ ...LEAD, email: "" }));
    expect(send.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it("usa o e-mail de resposta do CRM quando LEADS_NOTIFY_EMAIL não existe", async () => {
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");
    vi.stubEnv("BREVO_REPLY_TO", "contato@reiners.agency");
    const POST = await loadPost();
    await POST(req(LEAD));
    expect(send.mock.calls[0][0].to).toEqual([{ email: "contato@reiners.agency" }]);
  });

  it("recusa chamada de outra origem e chamada sem Origin", async () => {
    const POST = await loadPost();
    expect((await POST(req(LEAD, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(req(LEAD, { origin: null }))).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it("corpo inválido: 400 (não é JSON), 413 (grande demais), 422 (sem nome / e-mail ruim)", async () => {
    const POST = await loadPost();
    expect((await POST(req("isto não é json"))).status).toBe(400);
    expect((await POST(req(JSON.stringify({ name: "x".repeat(20_000) })))).status).toBe(413);

    const semNome = await POST(req({ ...LEAD, name: "" }));
    expect(semNome.status).toBe(422);
    expect((await semNome.json()).errors.name).toBeTruthy();

    const emailRuim = await POST(req({ ...LEAD, email: "nao-e-email" }));
    expect(emailRuim.status).toBe(422);
    expect((await emailRuim.json()).errors.email).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("campo-isca preenchido: finge sucesso e não gasta e-mail", async () => {
    const POST = await loadPost();
    const res = await POST(req({ ...LEAD, website: "http://spam.example" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("o mesmo envio repetido (duplo clique) só avisa a equipe uma vez", async () => {
    const POST = await loadPost();
    expect((await POST(req(LEAD))).status).toBe(202);
    const again = await POST(req(LEAD));
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("limite por IP: a 7ª chamada em 10 minutos leva 429", async () => {
    const POST = await loadPost();
    for (let i = 0; i < 6; i++) {
      expect((await POST(req({ ...LEAD, name: `Pessoa ${i}` }))).status).toBe(202);
    }
    expect((await POST(req({ ...LEAD, name: "Pessoa 7" }))).status).toBe(429);
    // Outro IP não é afetado.
    expect((await POST(req({ ...LEAD, name: "Outro IP" }, { "x-real-ip": "198.51.100.9" }))).status).toBe(202);
    expect(send).toHaveBeenCalledTimes(7);
  });

  it("falha da Brevo: 502, o motivo vai ao log SEM dados de quem escreveu, e dá para reenviar", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValueOnce({ provider: "brevo", ok: false, error: "Brevo 402: limite do plano" });
    const POST = await loadPost();

    const res = await POST(req(LEAD));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, notified: false });

    const logged = error.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("Brevo 402");
    expect(logged).not.toContain("Ana Furtado");
    expect(logged).not.toContain("ana@empresa.com.br");
    expect(logged).not.toContain("99920");

    // Não ficou marcado como "já avisado": a nova tentativa envia de fato.
    expect((await POST(req(LEAD))).status).toBe(202);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("em produção sem BREVO_API_KEY (provider mock): 503 em vez de fingir que avisou", async () => {
    providerName = "mock";
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const POST = await loadPost();
    const res = await POST(req(LEAD));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, notified: false });
    expect(send).not.toHaveBeenCalled();
    expect(error.mock.calls.join(" ")).toContain("BREVO_API_KEY");
  });

  it("em dev/CI o provider mock é aceito (não faz rede, o fluxo segue)", async () => {
    providerName = "mock";
    vi.stubEnv("NODE_ENV", "test");
    const POST = await loadPost();
    expect((await POST(req(LEAD))).status).toBe(202);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sem nenhum destinatário configurado: 503 e nada é enviado", async () => {
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const POST = await loadPost();
    const res = await POST(req(LEAD));
    expect(res.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
});
