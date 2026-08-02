import { describe, expect, it } from "vitest";
import {
  normalizeTracks,
  parseSpotifyRef,
  parseYouTubeId,
  spotifyEmbedUrl,
  youTubeEmbedUrl,
} from "@/lib/portfolio/embeds";
import { slugify } from "@/lib/portfolio/slug";

describe("parseYouTubeId", () => {
  it("reconhece os formatos usuais de URL", () => {
    const id = "aqz-KE-bpKQ";
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(parseYouTubeId(`https://youtu.be/${id}`)).toBe(id);
    expect(parseYouTubeId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(parseYouTubeId(`https://www.youtube.com/live/${id}`)).toBe(id);
    expect(parseYouTubeId(`youtube.com/watch?v=${id}&t=42s`)).toBe(id);
  });

  it("aceita o ID cru", () => {
    expect(parseYouTubeId("aqz-KE-bpKQ")).toBe("aqz-KE-bpKQ");
  });

  it("rejeita entradas inválidas e domínios de terceiros", () => {
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("não é uma url")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/12345")).toBeNull();
    // Domínio que apenas TERMINA com o nome não pode passar.
    expect(parseYouTubeId("https://evil-youtube.com/watch?v=aqz-KE-bpKQ")).toBeNull();
  });

  it("gera embed sem sugestões de terceiros", () => {
    expect(youTubeEmbedUrl("https://youtu.be/aqz-KE-bpKQ")).toBe(
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0",
    );
    expect(youTubeEmbedUrl("lixo")).toBeNull();
  });
});

describe("parseSpotifyRef", () => {
  it("reconhece URL aberta, URI e URL de embed", () => {
    const id = "5Xt5DXGzch68nYYamXrNxZ";
    expect(parseSpotifyRef(`https://open.spotify.com/episode/${id}`)).toEqual({
      kind: "episode",
      id,
    });
    expect(parseSpotifyRef(`spotify:show:${id}`)).toEqual({ kind: "show", id });
    expect(parseSpotifyRef(`https://open.spotify.com/embed/episode/${id}`)).toEqual({
      kind: "episode",
      id,
    });
    expect(parseSpotifyRef(`https://open.spotify.com/intl-pt/track/${id}?si=abc`)).toEqual({
      kind: "track",
      id,
    });
  });

  it("rejeita entradas inválidas", () => {
    expect(parseSpotifyRef(null)).toBeNull();
    expect(parseSpotifyRef("https://open.spotify.com/")).toBeNull();
    expect(parseSpotifyRef("https://spotify.evil.com/episode/abc")).toBeNull();
  });

  it("gera embed em tema escuro", () => {
    expect(spotifyEmbedUrl("spotify:episode:abc123")).toBe(
      "https://open.spotify.com/embed/episode/abc123?theme=0",
    );
  });
});

describe("normalizeTracks", () => {
  it("nunca inventa embed sem URL correspondente", () => {
    const result = normalizeTracks({ youtubeUrl: "  ", spotifyUrl: null });
    expect(result).toEqual({
      youtubeUrl: null,
      youtubeEmbed: null,
      spotifyUrl: null,
      spotifyEmbed: null,
    });
  });

  it("mantém a URL original mesmo quando o embed não é reconhecido", () => {
    const result = normalizeTracks({ youtubeUrl: "https://exemplo.com/video" });
    expect(result.youtubeUrl).toBe("https://exemplo.com/video");
    expect(result.youtubeEmbed).toBeNull();
  });
});

describe("slugify", () => {
  it("remove acentos e normaliza separadores", () => {
    expect(slugify("Podcast In Loco 2024!")).toBe("podcast-in-loco-2024");
    expect(slugify("  Câmpanha   Vivá  ")).toBe("campanha-viva");
    expect(slugify("---")).toBe("");
  });

  it("limita o tamanho", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});
