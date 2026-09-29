import { describe, it, expect } from "vitest";
import { NOINDEX, PRIVATE_PATHS, PUBLIC_PATHS, publicPaths, siteBaseUrl } from "@/lib/site/seo";

describe("separação entre vitrine e áreas privadas", () => {
  it("só a vitrine do estúdio é pública — hoje, só a raiz (portfólio oculto)", () => {
    expect([...PUBLIC_PATHS]).toEqual(["/"]);
  });

  it("/portfolio volta ao sitemap junto com a chave do portfólio", () => {
    expect([...publicPaths(false)]).toEqual(["/"]);
    expect([...publicPaths(true)]).toEqual(["/", "/portfolio"]);
  });

  it("a landing do CRM não existe mais, nem como rota bloqueada", () => {
    expect(PRIVATE_PATHS).not.toContain("/crm");
  });

  it("toda área logada, portal e admin está na lista privada", () => {
    for (const path of ["/app", "/admin", "/portal", "/login"]) {
      expect(PRIVATE_PATHS).toContain(path);
    }
  });

  it("nenhuma rota pública aparece como privada (não se bloqueia a si mesmo)", () => {
    for (const pub of PUBLIC_PATHS) {
      expect(PRIVATE_PATHS).not.toContain(pub);
    }
  });

  it("o prefixo privado cobre as rotas filhas", () => {
    const blocked = (p: string) => PRIVATE_PATHS.some((priv) => p === priv || p.startsWith(`${priv}/`));
    expect(blocked("/app/studio")).toBe(true);
    expect(blocked("/admin/site/planos")).toBe(true);
    expect(blocked("/portal/sicredi/contratos")).toBe(true);
    // A vitrine continua liberada — e /portfolio não é área privada: oculto
    // ele responde 404, e quando voltar não precisa de mudança aqui.
    expect(blocked("/")).toBe(false);
    expect(blocked("/portfolio")).toBe(false);
  });
});

describe("NOINDEX", () => {
  it("pede noindex, nofollow e sem cache", () => {
    expect(NOINDEX.robots).toMatchObject({ index: false, follow: false, nocache: true });
  });

  it("repete a diretiva para o googlebot", () => {
    expect(NOINDEX.robots).toMatchObject({
      googleBot: { index: false, follow: false, noimageindex: true },
    });
  });
});

describe("siteBaseUrl", () => {
  it("é absoluta e sem barra final (o sitemap concatena o caminho)", () => {
    const base = siteBaseUrl();
    expect(base).toMatch(/^https:\/\//);
    expect(base.endsWith("/")).toBe(false);
  });
});
