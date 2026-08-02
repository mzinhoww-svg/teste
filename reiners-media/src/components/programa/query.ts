/**
 * TCK-016 — Regras de visibilidade pública de um programa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ISSO NÃO É SÓ UM `where` INLINE NA PÁGINA
 * ─────────────────────────────────────────────────────────────────────────────
 * A regra "programa soft-deletado não aparece em rota pública" é de negócio, e
 * a página a aplica em DOIS pontos: no filtro da consulta e na decisão de
 * `notFound()`. Isolá-la aqui:
 *
 *   - deixa a decisão de 404 testável sem banco, sem React e sem Next
 *     (`notFound()` só lança dentro de um render de rota);
 *   - garante que os dois pontos concordem — se alguém trocar o `where` por um
 *     `findUnique({ where: { slug } })` (que não aceita `deletedAt`), o segundo
 *     portão continua barrando a linha soft-deletada em vez de publicá-la;
 *   - documenta que `generateStaticParams` usa EXATAMENTE o mesmo filtro, então
 *     um programa deletado nunca entra na lista de rotas pré-renderizadas.
 *
 * `deletedAt` é metadado interno (`contracts/README.md`, decisão 6): ele entra
 * no filtro, é lido por `isPubliclyVisible`, e nunca chega à camada pública —
 * `toPublicPodcastWithEpisodes` o descarta antes de qualquer render.
 */

/** Filtro de linha viva, compartilhado pela consulta e por `generateStaticParams`. */
export const PUBLIC_PODCAST_FILTER = { deletedAt: null } as const;

/** `where` do detalhe público: slug + linha viva. */
export function publicPodcastWhere(slug: string): { slug: string; deletedAt: null } {
  return { slug, ...PUBLIC_PODCAST_FILTER };
}

/** Recorte mínimo para decidir visibilidade — evita acoplar ao modelo inteiro. */
export interface SoftDeletable {
  readonly deletedAt?: Date | string | null;
}

/**
 * Segundo portão do 404: `null`/`undefined` (slug inexistente) e linha com
 * `deletedAt` preenchido são igualmente invisíveis.
 *
 * Note que `deletedAt` AUSENTE conta como visível: os serializadores públicos
 * removem a chave, e uma linha já serializada continua sendo publicável.
 */
export function isPubliclyVisible(row: SoftDeletable | null | undefined): boolean {
  if (row === null || row === undefined) return false;
  return row.deletedAt === null || row.deletedAt === undefined;
}

/** Ordenação dos episódios: a mesma de `GET /api/podcasts/:slug` (TCK-005). */
export const EPISODE_ORDER_BY = [{ publishedAt: 'desc' }, { number: 'desc' }] as const;
