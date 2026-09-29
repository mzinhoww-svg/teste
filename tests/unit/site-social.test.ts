import { describe, it, expect } from "vitest";
import { DEFAULT_INSTAGRAM_URL, instagramHandle } from "@/lib/site/social";

describe("Instagram do estúdio", () => {
  it("o padrão é o perfil @reinersmedia", () => {
    expect(DEFAULT_INSTAGRAM_URL).toBe("https://instagram.com/reinersmedia");
    expect(instagramHandle(DEFAULT_INSTAGRAM_URL)).toBe("@reinersmedia");
  });

  it("extrai o @ de variações da URL de perfil", () => {
    expect(instagramHandle("https://www.instagram.com/reinersmedia/")).toBe("@reinersmedia");
    expect(instagramHandle("https://instagram.com/reinersmedia?hl=pt-br")).toBe("@reinersmedia");
    expect(instagramHandle("http://instagram.com/reiners.media_")).toBe("@reiners.media_");
    expect(instagramHandle("  https://instagram.com/reinersmedia  ")).toBe("@reinersmedia");
  });

  it("devolve null quando não dá para saber o perfil (só o ícone aparece)", () => {
    for (const url of [
      null,
      undefined,
      "",
      "não é url",
      "https://exemplo.com/reinersmedia",
      "https://notinstagram.com/reinersmedia",
      "https://instagram.com/",
      // post, reel, story… não são perfil: "/p/abc" não é o usuário "@p".
      "https://instagram.com/p/Cxyz123/",
      "https://www.instagram.com/reel/Cxyz123/",
      "https://instagram.com/explore/tags/podcast",
    ]) {
      expect(instagramHandle(url as string | null | undefined), String(url)).toBeNull();
    }
  });
});
