import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG, DEFAULT_PLANS, DEFAULT_PROGRAMS, DEFAULT_TESTIMONIALS,
  initials, toConfig, toPlan, toProgram, toTestimonial,
} from "@/lib/site/content";

describe("normalização das linhas do CMS", () => {
  it("toPlan converte snake_case e só aceita features string", () => {
    const plan = toPlan({
      id: "1", name: "Podcast In Loco", price: "R$ 2.190", period: "/episódio",
      description: null, features: ["Edição em 48h", 42, null], is_featured: true, display_order: "2",
    });
    expect(plan.features).toEqual(["Edição em 48h"]);
    expect(plan.isFeatured).toBe(true);
    expect(plan.displayOrder).toBe(2);
    expect(plan.description).toBeNull();
  });

  it("toPlan tolera features não-array (coluna corrompida)", () => {
    expect(toPlan({ id: "1", name: "X", price: "R$ 1", features: "oops" }).features).toEqual([]);
  });

  it("toConfig cai no default quando o campo está vazio", () => {
    const config = toConfig({ site_name: "  ", cta_primary_text: "Ver preços", seo_title: "" });
    expect(config.siteName).toBe(DEFAULT_CONFIG.siteName);
    expect(config.ctaPrimaryText).toBe("Ver preços");
    expect(config.seoTitle).toBe(DEFAULT_CONFIG.seoTitle);
    expect(config.heroVideoUrl).toBeNull();
  });

  it("toTestimonial e toProgram mapeiam os campos opcionais", () => {
    expect(toTestimonial({ id: "1", name: "Ana", role: "CMO", quote: "ok" }).avatarUrl).toBeNull();
    const program = toProgram({ id: "1", title: "Domo Cast", slug: "domo-cast", featured: true });
    expect(program.featured).toBe(true);
    expect(program.posterUrl).toBeNull();
  });
});

describe("defaults da landing", () => {
  it("existem e são suficientes para renderizar sem banco", () => {
    expect(DEFAULT_PLANS).toHaveLength(3);
    expect(DEFAULT_TESTIMONIALS).toHaveLength(3);
    expect(DEFAULT_PROGRAMS).toHaveLength(5);
    expect(DEFAULT_PLANS.filter((p) => p.isFeatured)).toHaveLength(1);
    expect(DEFAULT_PROGRAMS.every((p) => p.featured)).toBe(true);
  });

  it("todo plano tem preço e ao menos um item incluso", () => {
    for (const plan of DEFAULT_PLANS) {
      expect(plan.price).toMatch(/^R\$/);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });
});

describe("initials", () => {
  it("usa no máximo duas iniciais", () => {
    expect(initials("Ana Furtado")).toBe("AF");
    expect(initials("Ana Maria Furtado")).toBe("AM");
    expect(initials("Ana")).toBe("A");
  });
});
