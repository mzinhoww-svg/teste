import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { BACKSTAGE_PHOTOS, SCENARIOS, ZURA_PHOTO } from "@/lib/site/gallery";

const PUBLIC = join(__dirname, "../../public");
const ALL = [...SCENARIOS, ZURA_PHOTO, ...BACKSTAGE_PHOTOS];

describe("galeria do estúdio", () => {
  it("todo arquivo referenciado existe em /public e é leve (WebP < 200 KB)", () => {
    for (const photo of ALL) {
      const file = join(PUBLIC, photo.src);
      expect(existsSync(file), photo.src).toBe(true);
      expect(photo.src.endsWith(".webp")).toBe(true);
      expect(statSync(file).size, photo.src).toBeLessThan(200 * 1024);
    }
  });

  it("toda foto tem texto alternativo e dimensões reais", () => {
    for (const photo of ALL) {
      expect(photo.alt.trim().length, photo.src).toBeGreaterThan(20);
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
    }
  });

  it("são cinco cenários, com nome e descrição, sem ids repetidos", () => {
    expect(SCENARIOS).toHaveLength(5);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(5);
    for (const s of SCENARIOS) {
      expect(s.name).not.toBe("");
      expect(s.description).not.toBe("");
    }
  });

  it("bastidores não identificam ninguém: alt descreve a cena, não a pessoa", () => {
    for (const photo of BACKSTAGE_PHOTOS) expect(photo.alt.startsWith("Bastidores:")).toBe(true);
  });

  it("a foto do Zura é a padrão da seção Sobre", () => {
    expect(ZURA_PHOTO.alt).toContain("Estúdio Zura");
  });
});
