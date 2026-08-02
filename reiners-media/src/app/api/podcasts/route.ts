/**
 * `/api/podcasts` — TCK-005 (CONTRACT-006), documentado em
 * `contracts/api/podcasts.yaml`.
 *
 * - `GET`  — rota pública, lista paginada com filtros e ordenação. Só programas
 *   com `deletedAt: null` (soft delete é invisível para o público).
 * - `POST` — requer ADMIN ou EDITOR. BR-003 (>= 1 host) é fechado pelo schema;
 *   BR-005 (máx. 3 destaques) e BR-006 (ENDED não é destaque) são fechados aqui
 *   com `validatePodcastRules`, porque dependem do estado do banco.
 *
 * As linhas do Prisma NUNCA vão cruas para o schema de resposta: `deletedAt`,
 * `Date` e `Json` nulo quebrariam o `.strict()` (ver `contracts/README.md`).
 * Sempre `toPublicPodcast`.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { requireEditor } from '@/app/api/podcasts/_lib/guard';
import {
  apiError,
  businessRuleConflict,
  handleRouteError,
  parseWith,
  readJsonBody,
  searchParamsToObject,
  validatedJson,
} from '@/app/api/podcasts/_lib/http';
import { RATE_LIMIT_POLICIES, enforceRateLimit } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import {
  podcastCreateSchema,
  podcastListResponseSchema,
  podcastQuerySchema,
  podcastResponseSchema,
  toPublicPodcast,
  validatePodcastRules,
} from '@/lib/schemas';

/** Prisma acessa o banco: nada aqui pode ser renderizado estaticamente. */
export const dynamic = 'force-dynamic';

type PodcastQuery = ReturnType<typeof podcastQuerySchema.parse>;

/** Monta o `where` do Prisma a partir dos filtros já validados. */
export function buildPodcastWhere(query: PodcastQuery): Record<string, unknown> {
  const where: Record<string, unknown> = { deletedAt: null };
  if (query.status !== undefined) where.status = query.status;
  if (query.featured !== undefined) where.featured = query.featured;
  if (query.category !== undefined) {
    where.category = { equals: query.category, mode: 'insensitive' };
  }
  return where;
}

/** Ordenação estável: o critério pedido + `id` como desempate determinístico. */
export function buildPodcastOrderBy(query: PodcastQuery): Record<string, string>[] {
  return [{ [query.sort]: query.order }, { id: 'asc' }];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const limited = enforceRateLimit(request, 'GET /api/podcasts', RATE_LIMIT_POLICIES.publicApi);
    if (limited) return limited;

    const query = parseWith(
      podcastQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
      'Parâmetros de consulta inválidos',
    );
    if (!query.ok) return query.response;

    const where = buildPodcastWhere(query.value);
    const { page, limit } = query.value;

    const [rows, total] = await Promise.all([
      prisma.podcast.findMany({
        where,
        orderBy: buildPodcastOrderBy(query.value),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.podcast.count({ where }),
    ]);

    return validatedJson(podcastListResponseSchema, {
      data: (rows as Record<string, unknown>[]).map(toPublicPodcast),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireEditor(request);
    if (!session.ok) return session.response;

    const limited = enforceRateLimit(request, 'POST /api/podcasts', RATE_LIMIT_POLICIES.adminApi);
    if (limited) return limited;

    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const payload = parseWith(podcastCreateSchema, body.value, 'Programa inválido');
    if (!payload.ok) return payload.response;

    const podcast = payload.value;

    // BR-005 / BR-006 sobre o estado final. `otherFeaturedCount` conta apenas
    // programas vivos: um destaque soft-deletado não ocupa vaga.
    const otherFeaturedCount = await prisma.podcast.count({
      where: { featured: true, deletedAt: null },
    });
    const violations = validatePodcastRules({
      status: podcast.status,
      featured: podcast.featured,
      otherFeaturedCount,
    });
    if (violations.length > 0) return businessRuleConflict(violations);

    const existing = await prisma.podcast.findFirst({
      where: { slug: podcast.slug },
      select: { id: true },
    });
    if (existing) {
      return apiError('CONFLICT', `Já existe um programa com o slug "${podcast.slug}"`, {
        slug: podcast.slug,
      });
    }

    const created = (await prisma.podcast.create({
      data: {
        slug: podcast.slug,
        title: podcast.title,
        tagline: podcast.tagline ?? null,
        description: podcast.description,
        coverImage: podcast.coverImage,
        heroImage: podcast.heroImage ?? null,
        category: podcast.category,
        status: podcast.status,
        visualStyle: podcast.visualStyle,
        year: podcast.year,
        accentColor: podcast.accentColor,
        hosts: podcast.hosts,
        socialLinks: podcast.socialLinks,
        featured: podcast.featured,
        displayOrder: podcast.displayOrder,
      },
    })) as Record<string, unknown>;

    return validatedJson(podcastResponseSchema, { data: toPublicPodcast(created) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
