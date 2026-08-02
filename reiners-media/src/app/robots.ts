/**
 * TCK-022 — `/robots.txt` (FR-019).
 *
 * Rota de metadata do App Router: só o `export default` sai daqui.
 *
 * POLÍTICA
 * - Público liberado (`Allow: /`) — a descoberta orgânica é o objetivo do produto.
 * - `/admin` bloqueado: painel autenticado (TCK-017/018). Indexar a tela de login
 *   não traz tráfego útil e expõe superfície administrativa em resultado de busca.
 * - `/api` bloqueado: são respostas JSON, não páginas. Indexá-las gasta crawl
 *   budget e faz o Google mostrar payload cru como se fosse conteúdo.
 * - `Disallow` casa por PREFIXO, então `/admin` já cobre `/admin/podcasts/123`.
 *
 * ATENÇÃO — robots.txt é uma diretiva pública, NÃO um controle de acesso. Quem
 * de fato protege `/admin` e as rotas privadas de `/api` é o middleware de
 * TCK-004; este arquivo apenas evita indexação.
 */
import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/metadata';

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
