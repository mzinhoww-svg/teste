// Redes de contato do estúdio.

/**
 * Instagram oficial: @reinersmedia. É o padrão do site — o CMS
 * (site_config.instagram_url) só sobrescreve quando houver outra URL lá, e
 * coluna vazia NÃO apaga o perfil (mesma regra do hero e da foto do "Sobre").
 */
export const DEFAULT_INSTAGRAM_URL = "https://instagram.com/reinersmedia";

// Primeiros segmentos de URL do Instagram que NÃO são perfil (post, reel,
// story…): "instagram.com/p/abc" não é o usuário "@p".
const NOT_A_PROFILE = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about"]);

/**
 * `https://www.instagram.com/reinersmedia/?hl=pt-br` → `@reinersmedia`.
 * `null` quando a URL não é de perfil do Instagram — quem chama então não
 * mostra o texto, só o ícone.
 */
export function instagramHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { hostname, pathname } = new URL(url.trim());
    if (!/(^|\.)instagram\.com$/i.test(hostname)) return null;
    const user = pathname.split("/").filter(Boolean)[0];
    // Usuário do Instagram: letras, números, ponto e sublinhado.
    if (!user || NOT_A_PROFILE.has(user.toLowerCase()) || !/^[A-Za-z0-9._]+$/.test(user)) return null;
    return `@${user}`;
  } catch {
    return null;
  }
}
