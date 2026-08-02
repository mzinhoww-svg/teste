import { describe, expect, it } from "vitest";
import { demoPodcasts, DEMO_PODCASTS } from "@/lib/portfolio/demo-data";
import { initialsOf, VISUAL_STYLES } from "@/lib/portfolio/types";

// O dataset de demonstração é, ao mesmo tempo, a fonte do seed e o fallback de
// runtime — então precisa satisfazer as mesmas invariantes do catálogo real.

describe("dataset de demonstração", () => {
  const podcasts = demoPodcasts();

  it("tem 5 programas, um por estilo visual", () => {
    expect(podcasts).toHaveLength(5);
    const styles = podcasts.map((p) => p.visualStyle).sort();
    expect(styles).toEqual([...VISUAL_STYLES].sort());
  });

  it("tem 5 episódios em cada programa", () => {
    for (const podcast of podcasts) {
      expect(podcast.episodes, podcast.slug).toHaveLength(5);
    }
  });

  it("usa slugs únicos", () => {
    const slugs = podcasts.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("numera os episódios sem repetição dentro do programa", () => {
    for (const podcast of podcasts) {
      const numbers = podcast.episodes.map((e) => e.number);
      expect(new Set(numbers).size, podcast.slug).toBe(numbers.length);
    }
  });

  it("converte as URLs de trilha em embeds", () => {
    const withYouTube = podcasts
      .flatMap((p) => p.episodes)
      .filter((e) => e.youtubeUrl !== null);
    expect(withYouTube.length).toBeGreaterThan(0);
    for (const episode of withYouTube) {
      expect(episode.youtubeEmbed).toContain("youtube-nocookie.com/embed/");
    }
  });

  it("inclui pelo menos um episódio sem trilha (estado disabled do botão)", () => {
    const semTrilha = podcasts
      .flatMap((p) => p.episodes)
      .filter((e) => !e.youtubeEmbed && !e.spotifyEmbed);
    expect(semTrilha.length).toBeGreaterThan(0);
  });

  it("serializa datas como ISO — atravessa a fronteira Server→Client", () => {
    for (const episode of podcasts.flatMap((p) => p.episodes)) {
      expect(episode.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("marca no máximo 3 programas como destaque (o carrossel exibe 3)", () => {
    expect(podcasts.filter((p) => p.featured).length).toBeLessThanOrEqual(3);
  });

  it("só usa links sociais http(s)", () => {
    for (const podcast of podcasts) {
      for (const url of Object.values(podcast.socialLinks)) {
        expect(url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("mantém os dados brutos e o formato de domínio em sincronia", () => {
    expect(DEMO_PODCASTS.map((p) => p.slug)).toEqual(podcasts.map((p) => p.slug));
  });
});

describe("initialsOf", () => {
  it("usa as iniciais explícitas quando existem", () => {
    expect(initialsOf({ name: "Marcelo Reiners", initial: "MR" })).toBe("MR");
  });

  it("deriva do nome quando ausente", () => {
    expect(initialsOf({ name: "Paula Andrade" })).toBe("PA");
    expect(initialsOf({ name: "Ana" })).toBe("A");
    expect(initialsOf({ name: "maria da silva souza" })).toBe("MD");
  });
});
