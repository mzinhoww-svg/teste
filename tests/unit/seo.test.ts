import { describe, it, expect } from "vitest";
import { NOINDEX, PRIVATE_PATHS, PUBLIC_PATHS, siteBaseUrl } from "@/lib/site/seo";

describe("separação entre vitrine e áreas privadas", () => {
  it("só a vitrine do estúdio é pública", () => {
    expect([...PUBLIC_PATHS]).toEqual(["/", "/portfolio"]);
  });

  it("toda área do CRM, portal e admin está na lista privada", () => {
    for (const path of ["/crm", "/app", "/admin", "/portal", "/login"]) {
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
    // A vitrine continua liberada.
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
