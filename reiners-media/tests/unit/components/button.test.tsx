/** TCK-008 — Button: variantes, tamanhos e os 7 estados visuais. */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants } from '@/components/ui/button';

describe('Button', () => {
  it('renderiza o rótulo e usa type="button" por padrão', () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    // Default do HTML é `submit`: dentro de um <form> isso submeteria sem querer.
    expect(button).toHaveAttribute('type', 'button');
  });

  it('respeita um type explícito', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });

  it('encaminha o ref para o <button>', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ok</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('dispara onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Clique</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('variantes', () => {
    it.each(['primary', 'secondary', 'ghost', 'danger', 'link'] as const)(
      'renderiza a variante %s',
      (variant) => {
        render(<Button variant={variant}>Ação</Button>);
        expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant);
      },
    );

    it('usa tokens semânticos e nunca a paleta padrão do Tailwind', () => {
      const classes = buttonVariants({ variant: 'primary' });
      expect(classes).toContain('bg-accent');
      expect(classes).toContain('text-content-on-accent');
      expect(classes).not.toMatch(/\b(bg|text|border)-(purple|violet|zinc|gray|red)-\d/);
    });

    it('dá à variante secondary um limite com border-line-default (>= 3:1)', () => {
      // `line-subtle` é decorativo (~1.1:1) e reprovaria WCAG 2.2 §1.4.11.
      const classes = buttonVariants({ variant: 'secondary' });
      expect(classes).toContain('border-line-default');
      expect(classes).not.toContain('border-line-subtle');
    });

    it('mantém a variante danger tonal (não existe token de texto sobre danger sólido)', () => {
      const classes = buttonVariants({ variant: 'danger' });
      expect(classes).toContain('bg-state-danger-surface');
      expect(classes).toContain('text-state-danger');
      expect(classes).toContain('border-state-danger');
    });
  });

  describe('tamanhos', () => {
    it.each([
      ['sm', 'h-8'],
      ['md', 'h-10'],
      ['lg', 'h-12'],
      ['icon', 'h-10'],
      ['icon-sm', 'h-8'],
    ] as const)('aplica a altura do tamanho %s', (size, expected) => {
      render(<Button size={size}>A</Button>);
      expect(screen.getByRole('button').className).toContain(expected);
    });

    it('deixa a variante link anular a altura do tamanho', () => {
      // Prova a ordem `size` antes de `variant` no cva: sem isso, `h-10` venceria.
      render(
        <Button variant="link" size="md">
          Saiba mais
        </Button>,
      );
      const className = screen.getByRole('button').className;
      expect(className).toContain('h-auto');
      expect(className).not.toContain('h-10');
    });
  });

  describe('estado disabled', () => {
    it('desabilita e não dispara onClick', () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Salvar
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('estado loading', () => {
    it('marca aria-busy, desabilita e anuncia o carregamento', () => {
      render(<Button loading>Salvar</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toBeDisabled();
      expect(screen.getByText('Carregando')).toHaveClass('sr-only');
    });

    it('mantém o rótulo visível durante o loading (sem salto de largura)', () => {
      render(<Button loading>Publicar episódio</Button>);
      expect(screen.getByRole('button')).toHaveTextContent('Publicar episódio');
    });

    it('aceita um loadingLabel customizado', () => {
      render(
        <Button loading loadingLabel="Publicando">
          Publicar
        </Button>,
      );
      expect(screen.getByText('Publicando')).toBeInTheDocument();
    });

    it('esconde o spinner da árvore de acessibilidade (quem anuncia é aria-busy)', () => {
      const { container } = render(<Button loading>Salvar</Button>);
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });

    it('não dispara onClick enquanto carrega', () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Salvar
        </Button>,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('troca o ícone inicial pelo spinner', () => {
      render(
        <Button loading leadingIcon={<span data-testid="leading" />}>
          Salvar
        </Button>,
      );
      expect(screen.queryByTestId('leading')).toBeNull();
    });
  });

  it('renderiza ícones quando não está carregando', () => {
    render(
      <Button leadingIcon={<span data-testid="leading" />} trailingIcon={<span data-testid="trailing" />}>
        Salvar
      </Button>,
    );
    expect(screen.getByTestId('leading')).toBeInTheDocument();
    expect(screen.getByTestId('trailing')).toBeInTheDocument();
  });

  it('declara o estado de foco visível (WCAG 2.2 §2.4.13)', () => {
    render(<Button>Foco</Button>);
    const className = screen.getByRole('button').className;
    expect(className).toContain('focus-visible:outline-2');
    expect(className).toContain('focus-visible:outline-line-focus');
  });

  it('recebe foco por teclado', () => {
    render(<Button>Foco</Button>);
    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();
  });

  it('permite sobrescrever classes sem duplicar conflito', () => {
    render(<Button className="bg-surface-sunken">Custom</Button>);
    const className = screen.getByRole('button').className;
    expect(className).toContain('bg-surface-sunken');
    expect(className).not.toContain('bg-accent ');
  });

  it('aplica fullWidth', () => {
    render(<Button fullWidth>Largo</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });
});
