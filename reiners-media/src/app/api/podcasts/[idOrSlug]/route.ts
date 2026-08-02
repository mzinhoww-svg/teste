/**
 * `/api/podcasts/{slug}` (GET público) e `/api/podcasts/{id}` (PATCH/DELETE
 * administrativos) — TCK-005, `contracts/api/podcasts.yaml`.
 *
 * O contrato documenta duas rotas com nomes de parâmetro diferentes no mesmo
 * nível (`{slug}` e `{id}`). O App Router só admite UM segmento dinâmico por
 * nível, então o segmento se chama `[idOrSlug]` e cada método aplica o schema
 * que o contrato manda:
 * - GET    -> `slugParamSchema` (com atalho por UUID para o painel de TCK-018);
 * - PATCH  -> `idParamSchema`;
 * - DELETE -> `idParamSchema`.
 *
 * BR-002: DELETE é exclusivo de ADMIN; EDITOR recebe 403.
 * BR-005/BR-006: fechados no PATCH sobre o estado MESCLADO com
 * `resolvePodcastRuleState` + `validatePodcastRules` — `podcastUpdateSchema` é
 * parcial e sozinho deixaria `{"featured": true}` passar em programa ENDED.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { requireAdmin, requireEditor } from '@/app/api/podcasts/_lib/guard';
import {
  apiError,
  businessRuleConflict,
  handleRouteError,
  parseWith,
  readJsonBody,
  validatedJson,
} from '@/app/api/podcasts/_lib/http';
import { RATE_LIMIT_POLICIES, enforceRateLimit } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import {
  idParamSchema,
  podcastAdminResponseSchema,
  podcastDetailResponseSchema,
  podcastResponseSchema,
  podcastUpdateSchema,
  resolvePodcastRuleState,
  slugParamSchema,
  toAdminPodcast,
  toPublicPodcast,
  toPublicPodcastWithEpisodes,
  uuidSchema,
  validatePodcastRules,
} from '@/lib/schemas';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { idOrSlug: string };
}

/** Estado persistido mínimo para avaliar BR-005/BR-006 e o soft delete. */
interface CurrentPodcast {
  id: string;
  slug: string;
  status: 'ACTIVE' | 'ENDED' | 'HIATUS';
  featured: boolean;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const limited = enforceRateLimit(
      request,
      'GET /api/podcasts/:idOrSlug',
      RATE_LIMIT_POLICIES.publicApi,
    );
    if (limited) return limited;

    const identifier = context.params.idOrSlug;
    const asUuid = uuidSchema.safeParse(identifier);

    if (!asUuid.success) {
      const slug = parseWith(slugParamSchema, { slug: identifier }, 'Slug inválido');
      if (!slug.ok) return slug.response;
    }

    const where = asUuid.success
      ? { id: identifier, deletedAt: null }
      : { slug: identifier, deletedAt: null };

    const row = (await prisma.podcast.findFirst({
      where,
      // Episódios mais recentes primeiro, mesmo default de `episodeQuerySchema`.
      include: { episodes: { orderBy: { publishedAt: 'desc' } } },
    })) as Record<string, unknown> | null;

    if (!row) {
      return apiError('NOT_FOUND', `Programa "${identifier}" não encontrado`);
    }

    return validatedJson(podcastDetailResponseSchema, {
      data: toPublicPodcastWithEpisodes(row),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await requireEditor(request);
    if (!session.ok) return session.response;

    const limited = enforceRateLimit(
      request,
      'PATCH /api/podcasts/:id',
      RATE_LIMIT_POLICIES.adminApi,
    );
    if (limited) return limited;

    const params = parseWith(
      idParamSchema,
      { id: context.params.idOrSlug },
      'Identificador de programa inválido',
    );
    if (!params.ok) return params.response;
    const { id } = params.value;

    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const payload = parseWith(podcastUpdateSchema, body.value, 'Atualização inválida');
    if (!payload.ok) return payload.response;
    const patch = payload.value;

    const current = (await prisma.podcast.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, status: true, featured: true },
    })) as CurrentPodcast | null;

    if (!current) {
      return apiError('NOT_FOUND', `Programa ${id} não encontrado`);
    }

    // BR-005 e BR-006 sobre o estado MESCLADO. `otherFeaturedCount` exclui o
    // próprio programa: reordenar um destaque já existente não pode dar 409.
    const otherFeaturedCount = await prisma.podcast.count({
      where: { featured: true, deletedAt: null, id: { not: id } },
    });
    const violations = validatePodcastRules(
      resolvePodcastRuleState(current, patch, otherFeaturedCount),
    );
    if (violations.length > 0) return businessRuleConflict(violations);

    if (patch.slug !== undefined && patch.slug !== current.slug) {
      const clash = await prisma.podcast.findFirst({
        where: { slug: patch.slug, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        return apiError('CONFLICT', `Já existe um programa com o slug "${patch.slug}"`, {
          slug: patch.slug,
        });
      }
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) data[key] = value;
    }

    const updated = (await prisma.podcast.update({
      where: { id },
      data,
    })) as Record<string, unknown>;

    return validatedJson(podcastResponseSchema, { data: toPublicPodcast(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    // BR-002 — apenas ADMIN deleta. EDITOR autenticado recebe 403.
    const session = await requireAdmin(request);
    if (!session.ok) return session.response;

    const limited = enforceRateLimit(
      request,
      'DELETE /api/podcasts/:id',
      RATE_LIMIT_POLICIES.adminApi,
    );
    if (limited) return limited;

    const params = parseWith(
      idParamSchema,
      { id: context.params.idOrSlug },
      'Identificador de programa inválido',
    );
    if (!params.ok) return params.response;
    const { id } = params.value;

    const current = (await prisma.podcast.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    })) as { id: string } | null;

    if (!current) {
      return apiError('NOT_FOUND', `Programa ${id} não encontrado`);
    }

    // Soft delete: a linha permanece, só ganha `deletedAt`. Nenhuma rota
    // pública enxerga o registro depois disso.
    const deleted = (await prisma.podcast.update({
      where: { id },
      data: { deletedAt: new Date() },
    })) as Record<string, unknown>;

    return validatedJson(podcastAdminResponseSchema, { data: toAdminPodcast(deleted) });
  } catch (error) {
    return handleRouteError(error);
  }
}
