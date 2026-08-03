/**
 * TCK-016 — A rota `/portfolio/[slug]` (MINOR 6 da revisão da onda 2).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO PRECISOU DE MOCK DE `react`
 * ═════════════════════════════════════════════════════════════════════════════
 * `page.tsx` faz `import { cache } from 'react'`. No React 18.3 essa export só
 * existe sob a condição de resolução `react-server`; no build padrão que o
 * vitest carrega, `cache` chega `undefined` e o módulo estoura na avaliação —
 * `cache(...)` roda em escopo de módulo. Foi essa fricção que deixou a única
 * rota pública do produto com cobertura zero.
 *
 * O mock abaixo é a tradução honesta da semântica: `cache(fn)` devolve `fn`.
 * Perde-se a deduplicação entre `generateMetadata` e o render — que é
 * otimização, não comportamento — e ganha-se a possibilidade de asseverar
 * `revalidate`, `dynamicParams`, o filtro de `generateStaticParams` e os dois
 * portões de 404 antes que uma regressão chegue a produção.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O QUE O PRISMA DEVOLVE AQUI
 * ═════════════════════════════════════════════════════════════════════════════
 * `makePrismaPodcastRow()` traz `deletedAt` e `Date`, como a linha real. Se
 * alguém trocar `toPublicPodcastWithEpisodes` por um spread da linha crua, o
 * `.strict()` do `podcastSchema` derruba estes testes com `unrecognized_keys` —
 * exatamente o 500 que `contracts/README.md` descreve, só que em CI.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makePrismaPodcastRow } from './fixtures';

/** `cache(fn) === fn`. Ver o cabeçalho. */
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T,>(fn: T): T => fn };
});

/** `notFound()` do App Router lança; aqui lança algo que dá para asseverar. */
class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'NotFoundSignal';
  }
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundSignal();
  },
}));

const findFirst = vi.fn();
const findMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    podcast: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

// `next/link` renderiza `<a>` normalmente em jsdom; nada a mockar.
import ProgramaPage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
  revalidate,
} from '@/app/(public)/portfolio/[slug]/page';
import { MAIN_CONTENT_ID } from '@/components/layout/nav-config';

beforeEach(() => {
  findFirst.mockReset();
  findMany.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('configuração de rota (ISR)', () => {
  it('revalida de hora em hora', () => {
    expect(revalidate).toBe(3600);
  });

  it('gera sob demanda os programas criados depois do build', () => {
    // `false` aqui faria um programa novo responder 404 até o próximo deploy.
    expect(dynamicParams).toBe(true);
  });
});

describe('generateStaticParams', () => {
  it('pré-renderiza só programa vivo, e devolve os slugs', async () => {
    findMany.mockResolvedValue([{ slug: 'oficio' }, { slug: 'outro' }]);

    const params = await generateStaticParams();

    expect(params).toEqual([{ slug: 'oficio' }, { slug: 'outro' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        select: { slug: true },
      }),
    );
  });

  it('sem banco, degrada para lista vazia em vez de derrubar o build', async () => {
    findMany.mockRejectedValue(new Error('Environment variable not found: DATABASE_URL'));
    await expect(generateStaticParams()).resolves.toEqual([]);
  });
});

describe('generateMetadata', () => {
  it('monta a metadata do programa quando ele existe', async () => {
    findFirst.mockResolvedValue(makePrismaPodcastRow());

    const metadata = await generateMetadata({ params: { slug: 'oficio' } });

    expect(metadata.title).toBe('Ofício');
    expect(metadata.alternates?.canonical).toBe('/portfolio/oficio');
  });

  it('slug inexistente devolve metadata noindex, não a do site', async () => {
    findFirst.mockResolvedValue(null);

    const metadata = await generateMetadata({ params: { slug: 'nao-existe' } });

    expect(metadata.title).toBe('Programa não encontrado');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('programa soft-deletado devolve metadata noindex', async () => {
    findFirst.mockResolvedValue(makePrismaPodcastRow({ deletedAt: new Date('2025-01-01') }));

    const metadata = await generateMetadata({ params: { slug: 'oficio' } });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe('decisão de 404 na rota', () => {
  it('consulta filtrando slug E soft delete', async () => {
    findFirst.mockResolvedValue(makePrismaPodcastRow());

    await ProgramaPage({ params: { slug: 'oficio' } });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'oficio', deletedAt: null } }),
    );
  });

  it('slug inexistente chama notFound()', async () => {
    findFirst.mockResolvedValue(null);
    await expect(ProgramaPage({ params: { slug: 'nao-existe' } })).rejects.toThrow(NotFoundSignal);
  });

  it('SEGUNDO PORTÃO: soft-deletado chama notFound() mesmo se a consulta o trouxer', async () => {
    // Simula alguém trocar o `where` por um `findUnique({ where: { slug } })`,
    // que não aceita `deletedAt`. O programa continua invisível.
    findFirst.mockResolvedValue(makePrismaPodcastRow({ deletedAt: new Date('2025-01-01') }));
    await expect(ProgramaPage({ params: { slug: 'oficio' } })).rejects.toThrow(NotFoundSignal);
  });

  it('slug malformado chama notFound() sem nem consultar o banco', async () => {
    await expect(ProgramaPage({ params: { slug: 'Slug Inválido!' } })).rejects.toThrow(
      NotFoundSignal,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('render da página', () => {
  async function renderPage(slug = 'oficio') {
    findFirst.mockResolvedValue(makePrismaPodcastRow());
    const element = await ProgramaPage({ params: { slug } });
    return render(element);
  }

  it('serializa a linha do Prisma sem estourar no `.strict()`', async () => {
    // A linha traz `deletedAt` e `Date`; passá-la crua adiante viraria 500.
    await expect(renderPage()).resolves.toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Ofício' })).toBeInTheDocument();
  });

  it('cumpre o contrato de `<main>` do TCK-009 (skip-link)', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main');

    expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
    // `tabIndex={-1}`: sem ele o WebKit rola mas não move o foco.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('renderiza hero, abas e o episódio', async () => {
    await renderPage();

    expect(screen.getByRole('img', { name: 'Capa do programa Ofício' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('aria-selected', 'true');
  });

  it('publica JSON-LD de PodcastSeries e de BreadcrumbList', async () => {
    const { container } = await renderPage();
    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((node) => JSON.parse(node.textContent ?? '{}'));

    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toMatchObject({ '@type': 'PodcastSeries', name: 'Ofício' });
    expect(scripts[1]).toMatchObject({ '@type': 'BreadcrumbList' });
  });

  it('o JSON-LD escapa `</script>` vindo do banco', async () => {
    // Título hostil não pode fechar a tag e virar código.
    findFirst.mockResolvedValue(
      makePrismaPodcastRow({ title: 'Ofício</script><script>alert(1)</script>' }),
    );
    const element = await ProgramaPage({ params: { slug: 'oficio' } });
    const { container } = render(element);

    const raw = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? '';
    expect(raw).not.toContain('</script>');
    expect(raw).toContain('\\u003c');
    // E continua sendo JSON válido, com o título original preservado.
    expect(JSON.parse(raw).name).toBe('Ofício</script><script>alert(1)</script>');
  });

  it('leva de volta ao portfólio', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'Voltar ao portfólio' })).toHaveAttribute(
      'href',
      '/portfolio',
    );
  });
});
