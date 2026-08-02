/**
 * TCK-009 — AdminSidebar: RBAC (BR-001), rota ativa e colapso.
 *
 * O teste central deste arquivo é o de RBAC: ele falha se alguém remover o
 * `requiredRole` do item de gestão de usuários, se trocar o filtro por um
 * `display: none` (que mantém o item no DOM) ou se inverter a comparação de
 * papéis.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav-config';

function getNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Navegação do painel' });
}

describe('AdminSidebar', () => {
  describe('RBAC — BR-001 (ADMIN gerencia usuários)', () => {
    it('não mostra "Usuários" para EDITOR', () => {
      render(<AdminSidebar role="EDITOR" pathname="/admin" />);
      expect(screen.queryByRole('link', { name: 'Usuários' })).toBeNull();
    });

    it('mostra "Usuários" para ADMIN', () => {
      render(<AdminSidebar role="ADMIN" pathname="/admin" />);
      expect(screen.getByRole('link', { name: 'Usuários' })).toHaveAttribute(
        'href',
        '/admin/users',
      );
    });

    it('o item some do DOM — não é escondido por CSS', () => {
      // Esconder com `display:none` deixaria a rota vazando no HTML entregue
      // ao EDITOR, e um leitor de tela em modo de leitura ainda a alcançaria.
      const { container } = render(<AdminSidebar role="EDITOR" pathname="/admin" />);
      expect(container.querySelector('a[href="/admin/users"]')).toBeNull();
      expect(container.innerHTML).not.toContain('/admin/users');
    });

    it('EDITOR continua vendo todos os itens que não exigem ADMIN', () => {
      render(<AdminSidebar role="EDITOR" pathname="/admin" />);
      const links = within(getNav()).getAllByRole('link');
      const expected = ADMIN_NAV_ITEMS.filter((item) => item.requiredRole !== 'ADMIN');

      expect(links).toHaveLength(expected.length);
      for (const item of expected) {
        expect(within(getNav()).getByRole('link', { name: item.label })).toBeInTheDocument();
      }
    });

    it('ADMIN vê exatamente um item a mais que EDITOR', () => {
      const editor = render(<AdminSidebar role="EDITOR" pathname="/admin" />);
      const editorLinks = within(getNav()).getAllByRole('link').length;
      editor.unmount();

      render(<AdminSidebar role="ADMIN" pathname="/admin" />);
      expect(within(getNav()).getAllByRole('link').length).toBe(editorLinks + 1);
    });

    it('expõe o papel aplicado no DOM, para depuração e para o teste de regressão', () => {
      render(<AdminSidebar role="EDITOR" pathname="/admin" />);
      expect(screen.getByTestId('admin-sidebar')).toHaveAttribute('data-role', 'EDITOR');
    });
  });

  describe('rota ativa', () => {
    it('marca só o item da rota com aria-current="page"', () => {
      render(<AdminSidebar role="ADMIN" pathname="/admin/podcasts" />);
      const current = within(getNav())
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');

      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAccessibleName('Programas');
    });

    it('"Painel" é exato: não acende em subrotas', () => {
      // Sem `exact`, `/admin` seria prefixo de todas as rotas do painel e o
      // "Painel" ficaria aceso junto com "Programas".
      const subroute = render(<AdminSidebar role="ADMIN" pathname="/admin/podcasts" />);
      expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute('aria-current');
      subroute.unmount();

      render(<AdminSidebar role="ADMIN" pathname="/admin" />);
      expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('acende em rota filha do item (ex.: edição de episódio)', () => {
      render(<AdminSidebar role="ADMIN" pathname="/admin/episodes/42" />);
      expect(screen.getByRole('link', { name: 'Episódios' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('não sinaliza o item ativo só por cor', () => {
      // WCAG 2.2 §1.4.1: cor não pode ser o único portador de informação.
      render(<AdminSidebar role="ADMIN" pathname="/admin/podcasts" />);
      const active = screen.getByRole('link', { name: 'Programas' });
      expect(active.className).toContain('border-line-accent');
    });
  });

  describe('colapso', () => {
    it('começa expandida e alterna com o gatilho', () => {
      render(<AdminSidebar role="ADMIN" pathname="/admin" />);
      const toggle = screen.getByRole('button', { name: 'Recolher menu lateral' });

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle.getAttribute('aria-controls')).toBe(getNav().getAttribute('id'));

      fireEvent.click(toggle);

      const expanded = screen.getByRole('button', { name: 'Expandir menu lateral' });
      expect(expanded).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('admin-sidebar')).toHaveAttribute('data-collapsed', '');
    });

    it('mantém o NOME ACESSÍVEL dos links quando colapsada', () => {
      // Trocar rótulo por ícone "porque tem tooltip" quebra comando de voz:
      // tooltip é descrição, não nome.
      render(<AdminSidebar role="ADMIN" pathname="/admin" defaultCollapsed />);
      for (const item of ADMIN_NAV_ITEMS) {
        expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
      }
    });

    it('usa title só como reforço para o ponteiro', () => {
      const collapsed = render(<AdminSidebar role="ADMIN" pathname="/admin" defaultCollapsed />);
      expect(screen.getByRole('link', { name: 'Programas' })).toHaveAttribute(
        'title',
        'Programas',
      );
      collapsed.unmount();

      render(<AdminSidebar role="ADMIN" pathname="/admin" />);
      expect(screen.getByRole('link', { name: 'Programas' })).not.toHaveAttribute('title');
    });

    it('honra defaultCollapsed no modo não controlado', () => {
      render(<AdminSidebar role="ADMIN" pathname="/admin" defaultCollapsed />);
      expect(screen.getByRole('button', { name: 'Expandir menu lateral' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('no modo controlado não muda sozinha e avisa o dono do estado', () => {
      const onCollapsedChange = vi.fn();
      render(
        <AdminSidebar
          role="ADMIN"
          pathname="/admin"
          collapsed={false}
          onCollapsedChange={onCollapsedChange}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Recolher menu lateral' }));

      expect(onCollapsedChange).toHaveBeenCalledWith(true);
      // Continua expandida: quem manda é a prop.
      expect(screen.getByRole('button', { name: 'Recolher menu lateral' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });
  });

  it('é um landmark de navegação nomeado', () => {
    render(<AdminSidebar role="ADMIN" pathname="/admin" />);
    expect(getNav()).toBeInTheDocument();
  });

  it('separa-se do conteúdo com borda de limite acessível', () => {
    render(<AdminSidebar role="ADMIN" pathname="/admin" />);
    const aside = screen.getByTestId('admin-sidebar');
    expect(aside.className).toContain('border-line-default');
    expect(aside.className).not.toContain('border-line-subtle');
  });

  it('renderiza header e footer injetados', () => {
    render(
      <AdminSidebar
        role="ADMIN"
        pathname="/admin"
        header={<span>Reiners Admin</span>}
        footer={<button type="button">Sair</button>}
      />,
    );
    expect(screen.getByText('Reiners Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
