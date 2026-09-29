import { describe, it, expect } from "vitest";
import { PORTFOLIO_ENABLED, isPortfolioHref } from "@/lib/site/features";

describe("portfólio oculto", () => {
  it("está desligado: ainda não existe portfólio para mostrar", () => {
    // Ao ligar a chave (lib/site/features.ts), este teste deve ser trocado
    // junto com os e2e de "portfólio oculto" — é o aviso de que a seção volta.
    expect(PORTFOLIO_ENABLED).toBe(false);
  });

  it("isPortfolioHref reconhece qualquer destino da seção", () => {
    for (const href of ["/portfolio", "/portfolio/", "/portfolio#domo-cast", "/portfolio?x=1", "  /portfolio  "]) {
      expect(isPortfolioHref(href), href).toBe(true);
    }
  });

  it("isPortfolioHref não confunde com outros caminhos", () => {
    for (const href of ["/", "#planos", "/#planos", "/portfolios", "/portfolio-antigo", "https://exemplo.com/portfolio", "", null, undefined]) {
      expect(isPortfolioHref(href as string | null | undefined), String(href)).toBe(false);
    }
  });
});
