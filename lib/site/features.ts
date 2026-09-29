// Chaves de recurso do site público.
//
// PORTFOLIO_ENABLED — o portfólio de programas (teaser na landing, item
// "Programas" do menu, link e coluna no rodapé, CTA "Ouvir programas" do hero e
// a página /portfolio) está OCULTO: ainda não existe portfólio para mostrar, e
// os programas de exemplo em `DEFAULT_PROGRAMS` são só placeholders.
//
// Ocultar é reversível de propósito — nada foi apagado. Quando houver
// programas de verdade cadastrados em /admin/site/programas, é só trocar para
// `true` (e ajustar o CTA secundário do hero, se quiser): a seção, o menu, o
// rodapé, a rota e o sitemap voltam juntos. Tudo que depende da chave lê
// daqui — não há segunda fonte da verdade.
export const PORTFOLIO_ENABLED = false;

/** `/portfolio`, `/portfolio#slug`, `/portfolio?x` — qualquer destino da seção. */
export function isPortfolioHref(href: string | null | undefined): boolean {
  return /^\/portfolio(?:[/?#]|$)/.test((href ?? "").trim());
}
