/**
 * `GET /api/episodes` e `POST /api/episodes` — CONTRACT-007 (TCK-006).
 *
 * Contrato: `contracts/api/episodes.yaml` (operações `listEpisodes` e
 * `createEpisode`). Validação executável: `src/lib/schemas.ts`.
 *
 * Divisão de responsabilidades registrada no contrato:
 * - RBAC (BR-001/BR-002, 401/403) é decidido por `requireRole` de TCK-004; o
 *   handler só chama o guard (`./_lib/guard`) e devolve a resposta pronta.
 *   Rate limit (429) fica no middleware/handler de TCK-004/TCK-021.
 * - BR-004 no create é fechado pelo `.refine` de `episodeCreateSchema` -> 422.
 * - BR-007/BR-008 são derivados aqui, no servidor, por `src/lib/url-parser.ts`:
 *   `youtubeEmbed`/`spotifyEmbed` não existem no body (`.strict()`), então
 *   enviá-los é 422.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';
import {
  episodeCreateSchema,
  episodeListResponseSchema,
  episodeQuerySchema,
  episodeResponseSchema,
} from '@/lib/schemas';
import { deriveEpisodeEmbeds } from '@/lib/url-parser';

import { episodeNumberTaken, podcastExists, serializeEpisode } from './_lib/episodes';
import { requireEditor } from './_lib/guard';
import {
  conflict,
  internalError,
  notFound,
  readJsonBody,
  validationError,
} from './_lib/http';

/** Rotas de dados sempre dinâmicas: paginação e filtros não são cacheáveis. */
export const dynamic = 'force-dynamic';

/**
 * Lista paginada de episódios de um programa.
 *
 * `podcastId` é obrigatório (episódio só existe no contexto de um programa) e o
 * padrão de ordenação é `publishedAt desc` — mais recentes primeiro, que é a
 * ordem que TCK-014 espera na régua de episódios.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const query = episodeQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) {
      return validationError(query.error, 'Parâmetros de busca inválidos');
    }

    const { podcastId, page, limit, sort, order } = query.data;

    if (!(await podcastExists(podcastId))) {
      return notFound('Programa não encontrado');
    }

    const [total, rows] = await Promise.all([
      prisma.episode.count({ where: { podcastId } }),
      prisma.episode.findMany({
        where: { podcastId },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const body = episodeListResponseSchema.parse({
      data: rows.map(serializeEpisode),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error('[GET /api/episodes]', error);
    return internalError();
  }
}

/**
 * Cria um episódio com os embeds derivados das URLs (BR-007/BR-008).
 *
 * Ordem das checagens: sessão (401/403) -> schema (422) -> programa existe
 * (404) -> número livre (409) -> gravação. Autorização vem primeiro para que um
 * anônimo não consiga sondar quais programas existem pela diferença de status.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireEditor(request);
    if (!auth.ok) return auth.response;

    const json = await readJsonBody(request);
    if (!json.ok) return json.response;

    const parsed = episodeCreateSchema.safeParse(json.value);
    if (!parsed.success) {
      return validationError(parsed.error, 'Não foi possível criar o episódio');
    }

    const payload = parsed.data;

    if (!(await podcastExists(payload.podcastId))) {
      return notFound('Programa não encontrado');
    }

    if (await episodeNumberTaken(payload.podcastId, payload.number)) {
      return conflict(`Já existe um episódio número ${payload.number} neste programa`, {
        field: 'number',
        podcastId: payload.podcastId,
        number: payload.number,
      });
    }

    const youtubeUrl = payload.youtubeUrl ?? null;
    const spotifyUrl = payload.spotifyUrl ?? null;
    const embeds = deriveEpisodeEmbeds({ youtubeUrl, spotifyUrl });

    const created = await prisma.episode.create({
      data: {
        podcastId: payload.podcastId,
        number: payload.number,
        title: payload.title,
        description: payload.description,
        thumbnail: payload.thumbnail ?? null,
        duration: payload.duration,
        publishedAt: new Date(payload.publishedAt),
        youtubeUrl,
        spotifyUrl,
        youtubeEmbed: embeds.youtubeEmbed,
        spotifyEmbed: embeds.spotifyEmbed,
      },
    });

    const body = episodeResponseSchema.parse({ data: serializeEpisode(created) });
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    console.error('[POST /api/episodes]', error);
    return internalError();
  }
}
