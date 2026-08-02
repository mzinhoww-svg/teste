/**
 * TCK-009 — Navbar: skip-link, rota ativa e o teclado dentro do menu mobile.
 *
 * `@testing-library/user-event` não está no `package.json` (e `package.json`
 * não é deste ticket), então a tabulação é simulada com `fireEvent.keyDown` —
 * o jsdom não move foco no Tab sozinho, quem move é o handler do trap. É
 * exatamente o comportamento sob teste: sem o trap, o foco não anda e a
 * asserção falha.
 *
 * O `pathname` é passado por prop porque `usePathname()` devolve `null` fora do
 * App Router; a prop existe justamente para tornar a rota ativa testável sem
 * montar um roteador.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MAIN_CONTENT_ID } from '@/components/layout/nav-config';
import { Navbar, SCROLL_ELEVATION_THRESHOLD } from '@/components/layout/navbar';

function openMenu(): HTMLElement {
  const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

function getDrawer(): HTMLElement {
  return screen.getByRole('dialog');
}

/** Faz a página parecer rolada e espera o rAF do listener. */
async function scrollTo(y: number): Promise<void> {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
  fireEvent.scroll(window);
  await waitFor(() => {
    const header = screen.getByTestId('navbar');
    expect(header.hasAttribute('data-elevated')).toBe(y > SCROLL_ELEVATION_THRESHOLD);
  });
}

describe('Navbar', () => {
  describe('skip link (WCAG 2.2 §2.4.1)', () => {
    it('aponta para o id do conteúdo principal', () => {
      render(<Navbar pathname="/" />);
      expect(screen.getByTestId('skip-link')).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
    });

    it('é o PRIMEIRO elemento focável da barra', () => {
      // Se ele não vier primeiro, o usuário de teclado tabula pela navegação
      // inteira antes de encontrar o atalho que serve para pular a navegação.
      render(<Navbar pathname="/" />);
      const header = screen.getByTestId('navbar');
      const focusables = header.querySelectorAll('a[href], button:not([disabled])');
      expect(focusables[0]).toBe(screen.getByTestId('skip-link'));
    });

    it('está escondido de forma FOCÁVEL, não com display:none', () => {
      // `hidden`/`display:none` tiram o elemento da ordem de foco — um skip
      // link que não recebe foco simplesmente não existe.
      render(<Navbar pathname="/" />);
      const link = screen.getByTestId('skip-link');
      expect(link).not.toHaveAttribute('hidden');
      expect(link.className).toContain('sr-only-focusable');
      expect(link.className).not.toMatch(/\bhidden\b/);
    });

    it('encontra o alvo quando a página monta o <main> do contrato', () => {
      render(
        <>
          <Navbar pathname="/" />
          <main id={MAIN_CONTENT_ID} tabIndex={-1}>
            conteúdo
          </main>
        </>,
      );
      const target = screen.getByTestId('skip-link').getAttribute('href')?.slice(1) ?? '';
      const main = document.getElementById(target);
      expect(main).not.toBeNull();
      // `tabIndex={-1}` é o que faz o WebKit mover o FOCO, e não só o scroll.
      expect(main).toHaveAttribute('tabindex', '-1');
    });

    it('pode ser desligado quando o layout pai já renderiza um', () => {
      render(<Navbar pathname="/" showSkipLink={false} />);
      expect(screen.queryByTestId('skip-link')).toBeNull();
    });
  });

  describe('rota ativa', () => {
    it('marca aria-current="page" só no item da rota', () => {
      render(<Navbar pathname="/portfolio" />);
      const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
      const current = within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');

      expect(current).toHaveLength(1);
      expect(current[0]).toHaveTextContent('Portfólio');
    });

    it('marca "Início" na home e não marca "Portfólio"', () => {
      render(<Navbar pathname="/" />);
      const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
      expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(nav).getByRole('link', { name: 'Portfólio' })).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('não marca nada numa rota fora do menu', () => {
      render(<Navbar pathname="/privacidade" />);
      const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
      const current = within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current).toHaveLength(0);
    });

    it('a marca não disputa o aria-current com o item "Início"', () => {
      // Dois `aria-current="page"` na mesma view é ambiguidade para o leitor.
      render(<Navbar pathname="/" />);
      const header = screen.getByTestId('navbar');
      expect(header.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    });
  });

  describe('menu mobile', () => {
    it('o gatilho anuncia estado e alvo', () => {
      render(<Navbar pathname="/" />);
      const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' });

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      expect(trigger.getAttribute('aria-controls')).toBeTruthy();

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(getDrawer()).toHaveAttribute('id', trigger.getAttribute('aria-controls'));
    });

    it('abre como diálogo modal com nome acessível', () => {
      render(<Navbar pathname="/" />);
      openMenu();

      const drawer = getDrawer();
      expect(drawer).toHaveAttribute('aria-modal', 'true');
      // Um diálogo sem nome é anunciado como "diálogo" e nada mais.
      expect(screen.getByRole('dialog', { name: 'Navegação' })).toBe(drawer);
    });

    it('não existe no DOM enquanto fechado', () => {
      render(<Navbar pathname="/" />);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('move o foco para dentro na abertura', () => {
      render(<Navbar pathname="/" />);
      openMenu();
      expect(getDrawer().contains(document.activeElement)).toBe(true);
    });

    it('prende o Tab: do último focável volta para o primeiro', () => {
      render(<Navbar pathname="/" />);
      openMenu();

      const drawer = getDrawer();
      const focusables = drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      expect(focusables.length).toBeGreaterThan(1);
      last?.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(first).toHaveFocus();
    });

    it('prende o Shift+Tab: do primeiro vai para o último', () => {
      render(<Navbar pathname="/" />);
      openMenu();

      const drawer = getDrawer();
      const focusables = drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      first?.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();
    });

    it('traz o foco de volta se ele escapou do painel', () => {
      render(
        <>
          <button type="button">Fora</button>
          <Navbar pathname="/" />
        </>,
      );
      openMenu();

      screen.getByRole('button', { name: 'Fora' }).focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(getDrawer().contains(document.activeElement)).toBe(true);
    });

    it('Esc fecha o menu E devolve o foco ao gatilho', () => {
      render(<Navbar pathname="/" />);
      const trigger = openMenu();

      expect(getDrawer()).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).toBeNull();
      // O passo mais esquecido: sem ele o usuário de teclado é jogado no topo
      // do documento e perde o lugar na página.
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('o botão de fechar tem nome acessível e devolve o foco', () => {
      render(<Navbar pathname="/" />);
      const trigger = openMenu();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger).toHaveFocus();
    });

    it('fecha ao clicar no scrim', () => {
      render(<Navbar pathname="/" />);
      openMenu();
      fireEvent.click(screen.getByTestId('drawer-overlay'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('fecha ao navegar por um item do menu', () => {
      render(<Navbar pathname="/" />);
      openMenu();

      const drawer = getDrawer();
      const link = within(drawer).getByRole('link', { name: 'Portfólio' });
      // jsdom tenta navegar de verdade e loga "Not implemented: navigation";
      // o que interessa aqui é o handler do componente, não a navegação.
      link.addEventListener('click', (event) => event.preventDefault());

      fireEvent.click(link);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('trava o scroll do fundo enquanto aberto', () => {
      render(<Navbar pathname="/" />);
      openMenu();
      expect(document.body.style.overflow).toBe('hidden');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.body.style.overflow).toBe('');
    });

    it('a navegação do drawer tem rótulo DIFERENTE da horizontal', () => {
      // As duas listas coexistem no DOM; dois landmarks `navigation` com o
      // mesmo nome são indistinguíveis no rotor do leitor de tela.
      render(<Navbar pathname="/" />);
      openMenu();

      const labels = screen
        .getAllByRole('navigation')
        .map((nav) => nav.getAttribute('aria-label'));

      expect(new Set(labels).size).toBe(labels.length);
    });

    it('repete o aria-current dentro do drawer', () => {
      render(<Navbar pathname="/portfolio" />);
      openMenu();

      const drawer = getDrawer();
      expect(within(drawer).getByRole('link', { name: 'Portfólio' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  });

  describe('link com cara de botão (CTA)', () => {
    it('é um <a>, sem <button> aninhado dentro', () => {
      // Aninhar `<Button>` dentro de `<a>` produz árvore inválida e faz o
      // leitor anunciar o alvo duas vezes, com papéis conflitantes.
      render(<Navbar pathname="/" />);
      const cta = screen.getByRole('link', { name: 'Fale com a gente' });

      expect(cta.tagName).toBe('A');
      expect(cta.querySelector('button')).toBeNull();
      expect(cta.closest('button')).toBeNull();
    });

    it('carrega as classes de botão do TCK-008', () => {
      render(<Navbar pathname="/" />);
      const cta = screen.getByRole('link', { name: 'Fale com a gente' });
      expect(cta.className).toContain('bg-accent');
    });
  });

  describe('comportamento no scroll', () => {
    it('não fica elevada no topo e eleva depois do limiar', async () => {
      render(<Navbar pathname="/" />);
      const header = screen.getByTestId('navbar');

      expect(header).not.toHaveAttribute('data-elevated');
      expect(header.className).toContain('sticky');

      await scrollTo(SCROLL_ELEVATION_THRESHOLD + 10);
      expect(header.className).toContain('shadow-raised');

      await scrollTo(0);
      expect(header.className).not.toContain('shadow-raised');
    });

    it('permanece opaca por padrão (contraste do texto sobre a hero)', () => {
      render(<Navbar pathname="/" />);
      expect(screen.getByTestId('navbar').className).toContain('bg-surface-base');
    });

    it('transparentAtTop é opt-in e vale só no topo', async () => {
      render(<Navbar pathname="/" transparentAtTop />);
      const header = screen.getByTestId('navbar');

      expect(header.className).toContain('bg-transparent');
      await scrollTo(SCROLL_ELEVATION_THRESHOLD + 10);
      expect(header.className).toContain('bg-surface-base');
    });
  });

  it('aceita itens customizados (TCK-011/012 substituem os defaults)', () => {
    render(
      <Navbar
        pathname="/estudio"
        items={[
          { href: '/estudio', label: 'Estúdio' },
          { href: 'https://exemplo.com', label: 'Blog', external: true },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('link', { name: 'Estúdio' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const external = within(nav).getByRole('link', { name: 'Blog' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(external).not.toHaveAttribute('aria-current');
  });
});
