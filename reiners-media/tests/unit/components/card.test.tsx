/** TCK-008 — Card, Badge, Skeleton, Spinner e Avatar. */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { Avatar, getInitials } from '@/components/ui/avatar';
import { Badge, badgeVariants } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

describe('Card', () => {
  it('renderiza a composição completa', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Podcast do Reiners</CardTitle>
          <CardDescription>Temporada 2</CardDescription>
        </CardHeader>
        <CardContent>25 episódios</CardContent>
        <CardFooter>rodapé</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Podcast do Reiners' })).toBeInTheDocument();
    expect(screen.getByText('Temporada 2')).toBeInTheDocument();
    expect(screen.getByText('25 episódios')).toBeInTheDocument();
    expect(screen.getByText('rodapé')).toBeInTheDocument();
  });

  it('encaminha o ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>conteúdo</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('usa CardTitle como h3 por padrão e respeita o nível informado', () => {
    // Nível de heading é decisão da página, não do componente (WCAG §1.3.1).
    const { rerender } = render(<CardTitle>Título</CardTitle>);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();

    rerender(<CardTitle as="h2">Título</CardTitle>);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  describe('limite acessível (WCAG 2.2 §1.4.11)', () => {
    it('usa shadow-raised na variante elevated', () => {
      // `surface.raised` sobre `surface.base` é ~1.07:1 nos DOIS temas: quem
      // delimita o card é o hairline embutido em `shadow-raised`.
      expect(cardVariants({ variant: 'elevated' })).toContain('shadow-raised');
    });

    it('usa border-line-default na variante outlined', () => {
      const classes = cardVariants({ variant: 'outlined' });
      expect(classes).toContain('border-line-default');
      expect(classes).not.toContain('border-line-subtle');
    });

    it('não declara limite na variante ghost (agrupamento, não card)', () => {
      const classes = cardVariants({ variant: 'ghost' });
      expect(classes).not.toContain('shadow-raised');
      expect(classes).not.toContain('border-line');
    });
  });

  it('aplica feedback de elevação quando interactive', () => {
    expect(cardVariants({ interactive: true })).toContain('hover:shadow-poster');
  });
});

describe('Badge', () => {
  it.each(['neutral', 'accent', 'brand', 'success', 'warning', 'danger', 'info', 'outline'] as const)(
    'renderiza a variante %s',
    (variant) => {
      render(<Badge variant={variant}>rótulo</Badge>);
      expect(screen.getByText('rótulo')).toHaveAttribute('data-variant', variant);
    },
  );

  it('dá contorno visível a toda variante tonal', () => {
    // No dark `surface.sunken` é o mesmo preto do fundo da página; sem borda em
    // opacidade cheia o badge não teria contorno em nenhum dos dois temas.
    const variants = ['neutral', 'success', 'warning', 'danger', 'info'] as const;
    for (const variant of variants) {
      expect(badgeVariants({ variant })).toMatch(/border-(line|state)-/);
    }
  });

  it('aplica os tamanhos', () => {
    expect(badgeVariants({ size: 'sm' })).toContain('h-5');
    expect(badgeVariants({ size: 'md' })).toContain('h-6');
  });
});

describe('Skeleton', () => {
  it('é decorativo por padrão (aria-hidden)', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    const node = container.firstElementChild;
    expect(node).toHaveAttribute('aria-hidden', 'true');
    expect(node).not.toHaveAttribute('role');
  });

  it('vira role="status" quando recebe label', () => {
    render(<Skeleton label="Carregando episódios" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando episódios')).toHaveClass('sr-only');
  });

  it('usa cor visível nos dois temas', () => {
    // `surface.sunken` e `surface.base` são o MESMO preto no dark: só a
    // superfície invertida rende um bloco visível nos dois esquemas.
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain('bg-surface-inverse/10');
  });

  it('só anima sob motion-safe', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain('motion-safe:animate-pulse');
  });
});

describe('Spinner', () => {
  it('é decorativo por padrão', () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('vira role="status" com label', () => {
    render(<Spinner label="Carregando" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Carregando')).toHaveClass('sr-only');
  });

  it('congela explicitamente sob prefers-reduced-motion', () => {
    const { container } = render(<Spinner />);
    const ring = container.querySelector('span > span');
    expect(ring?.className).toContain('motion-reduce:animate-none');
  });
});

describe('Avatar', () => {
  it('extrai iniciais de primeiro e último nome', () => {
    expect(getInitials('Ana Maria Reiners')).toBe('AR');
    expect(getInitials('Reiners')).toBe('R');
    expect(getInitials('  ')).toBe('');
    expect(getInitials(undefined)).toBe('');
  });

  it('renderiza a imagem com alt quando há src', () => {
    render(<Avatar src="https://exemplo.test/a.png" name="Ana Reiners" />);
    expect(screen.getByRole('img', { name: 'Ana Reiners' })).toBeInstanceOf(HTMLImageElement);
  });

  it('cai para as iniciais quando a imagem falha', () => {
    render(<Avatar src="https://exemplo.test/quebrada.png" name="Ana Reiners" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ana Reiners' }));

    // Iniciais são `aria-hidden`; o nome acessível passa para o contêiner.
    expect(screen.getByText('AR')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('img', { name: 'Ana Reiners' })).not.toBeInstanceOf(HTMLImageElement);
  });

  it('sai da árvore de acessibilidade quando não há nome nem imagem', () => {
    const { container } = render(<Avatar />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('usa border-line-default como limite', () => {
    const { container } = render(<Avatar name="Ana" />);
    expect(container.firstElementChild?.className).toContain('border-line-default');
  });
});
