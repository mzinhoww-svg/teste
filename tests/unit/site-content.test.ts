import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG, DEFAULT_GUESTS, DEFAULT_PLANS, DEFAULT_PROGRAMS, DEFAULT_SERVICES,
  DEFAULT_TESTIMONIALS,
  initials, toConfig, toGuest, toPlan, toProgram, toService, toTestimonial,
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
    // Mudou de propósito: campo vazio cai no arquivo versionado em /public,
    // em vez de deixar o hero sem mídia. Ver "mídia do hero" abaixo.
    expect(config.heroVideoUrl).toBe(DEFAULT_CONFIG.heroVideoUrl);
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

describe("mídia do hero", () => {
  it("tem vídeo e pôster por padrão, servidos pelo próprio site", () => {
    expect(DEFAULT_CONFIG.heroVideoUrl).toBe("/hero.mp4");
    expect(DEFAULT_CONFIG.heroImageUrl).toBe("/hero-poster.jpg");
  });

  it("coluna vazia no banco não apaga o hero — cai no arquivo versionado", () => {
    const config = toConfig({ hero_video_url: null, hero_image_url: "  " });
    expect(config.heroVideoUrl).toBe("/hero.mp4");
    expect(config.heroImageUrl).toBe("/hero-poster.jpg");
  });

  it("uma URL de fato preenchida no CMS substitui o arquivo", () => {
    const config = toConfig({ hero_video_url: "https://cdn.exemplo/novo.mp4" });
    expect(config.heroVideoUrl).toBe("https://cdn.exemplo/novo.mp4");
  });
});

describe("imagem do Sobre e card de compartilhamento", () => {
  it("o card tem arquivo padrão — link sem card é pior que card genérico", () => {
    expect(DEFAULT_CONFIG.ogImageUrl).toBe("/og.jpg");
    expect(toConfig({}).ogImageUrl).toBe("/og.jpg");
  });

  it("a seção Sobre aceita ficar sem imagem: o componente desenha o gradiente", () => {
    expect(DEFAULT_CONFIG.aboutImageUrl).toBeNull();
    expect(toConfig({ about_image_url: "   " }).aboutImageUrl).toBeNull();
  });

  it("o CMS substitui as duas", () => {
    const config = toConfig({
      about_image_url: "https://cdn.exemplo/sobre.webp",
      og_image_url: "https://cdn.exemplo/card.jpg",
    });
    expect(config.aboutImageUrl).toBe("https://cdn.exemplo/sobre.webp");
    expect(config.ogImageUrl).toBe("https://cdn.exemplo/card.jpg");
  });
});

describe("prova social não tem placeholder", () => {
  it("depoimento sem frase real seria endosso fabricado — o default é vazio", () => {
    expect(DEFAULT_TESTIMONIALS).toEqual([]);
  });
});

describe("convidados — prova social factual", () => {
  it("não tem placeholder: inventar quem gravou no estúdio seria fabricar credencial", () => {
    expect(DEFAULT_GUESTS).toEqual([]);
  });

  it("toGuest aceita convidado sem foto e sem descrição", () => {
    const guest = toGuest({ id: "1", name: "Letícia Andrade" });
    expect(guest.name).toBe("Letícia Andrade");
    expect(guest.photoUrl).toBeNull();
    expect(guest.role).toBeNull();
    expect(guest.displayOrder).toBe(0);
  });

  it("toGuest mapeia snake_case", () => {
    const guest = toGuest({
      id: "1", name: "Ana", role: "convidada do Domo Cast",
      photo_url: "https://cdn.exemplo/ana.webp", display_order: "3",
    });
    expect(guest.role).toBe("convidada do Domo Cast");
    expect(guest.photoUrl).toBe("https://cdn.exemplo/ana.webp");
    expect(guest.displayOrder).toBe(3);
  });
});

describe("o que fazemos", () => {
  it("as seis frentes vêm no código: a landing não pode abrir sem oferta", () => {
    expect(DEFAULT_SERVICES).toHaveLength(6);
    for (const service of DEFAULT_SERVICES) {
      expect(service.title).not.toBe("");
      expect(service.description).toBeTruthy();
    }
  });

  it("a ordem é única e sequencial — ela vira a numeração 01..06 na tela", () => {
    const orders = DEFAULT_SERVICES.map((s) => s.displayOrder);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("nenhuma nasce com mídia: os vídeos entram pelo CMS depois", () => {
    for (const service of DEFAULT_SERVICES) {
      expect(service.videoUrl).toBeNull();
      expect(service.images).toEqual([]);
    }
  });

  it("toService corta em 3 imagens e descarta lixo da coluna jsonb", () => {
    const service = toService({
      id: "1", title: "Estúdio",
      images: ["a.webp", 42, "  ", "b.webp", "c.webp", "d.webp"],
    });
    expect(service.images).toEqual(["a.webp", "b.webp", "c.webp"]);
  });

  it("toService tolera images não-array", () => {
    expect(toService({ id: "1", title: "X", images: "oops" }).images).toEqual([]);
  });

  it("campo em branco no CMS conta como ausente, não como texto vazio", () => {
    const service = toService({ id: "1", title: "X", badge: "   ", footnote: "" });
    expect(service.badge).toBeNull();
    expect(service.footnote).toBeNull();
  });

  it("toService mapeia snake_case", () => {
    const service = toService({
      id: "1", title: "Cobertura de evento", video_url: "https://cdn/e.mp4",
      poster_url: "https://cdn/e.jpg", display_order: "2",
    });
    expect(service.videoUrl).toBe("https://cdn/e.mp4");
    expect(service.posterUrl).toBe("https://cdn/e.jpg");
    expect(service.displayOrder).toBe(2);
  });
});
