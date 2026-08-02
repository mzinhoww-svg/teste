/**
 * TCK-009 — AdminLayout: o contrato que TCK-017 monta em cima.
 *
 * Além da composição, este arquivo prova por RENDERIZAÇÃO NO SERVIDOR
 * (`renderToStaticMarkup`) que `Footer`, `SkipLink` e `AdminLayout` continuam
 * Server Components de verdade. `renderToStaticMarkup` não tem `useState` nem
 * efeitos: se alguém introduzir estado num deles, este teste falha com a mesma
 * mensagem que o `next build` daria — só que em 20ms, e sem precisar de uma
 * página montada.
 */
import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminLayout } from '@/components/layout/admin-layout';
import { Footer } from '@/components/layout/footer';
import { MAIN_CONTENT_ID } from '@/components/layout/nav-config';
import { SkipLink } from '@/components/layout/skip-link';

describe('AdminLayout', () => {
  it('monta o <main> exatamente como o contrato do skip-link exige', () => {
    render(<AdminLayout role="ADMIN">conteúdo do painel</AdminLayout>);
    const main = screen.getByRole('main');

    expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
    // Sem `tabIndex={-1}` o WebKit rola a página e deixa o foco no <body>.
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('skip-link')).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
  });

  it('tem um único landmark main', () => {
    const { container } = render(<AdminLayout role="ADMIN">conteúdo</AdminLayout>);
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('o skip-link vem antes da sidebar na ordem de foco', () => {
    const { container } = render(<AdminLayout role="ADMIN">conteúdo</AdminLayout>);
    const focusables = container.querySelectorAll('a[href], button:not([disabled])');
    expect(focusables[0]).toBe(screen.getByTestId('skip-link'));
  });

  it('propaga o papel para a sidebar — BR-001 vale também aqui', () => {
    render(<AdminLayout role="EDITOR">conteúdo</AdminLayout>);
    expect(screen.getByTestId('admin-sidebar')).toHaveAttribute('data-role', 'EDITOR');
    expect(screen.queryByRole('link', { name: 'Usuários' })).toBeNull();
  });

  it('não renderiza a navegação pública dentro do painel', () => {
    // Misturar as duas navegações desorienta: o painel tem a sua.
    render(<AdminLayout role="ADMIN">conteúdo</AdminLayout>);
    expect(screen.queryByTestId('navbar')).toBeNull();
    expect(screen.queryByTestId('footer')).toBeNull();
  });

  it('repassa props para a sidebar', () => {
    render(
      <AdminLayout role="ADMIN" sidebarProps={{ defaultCollapsed: true, pathname: '/admin' }}>
        conteúdo
      </AdminLayout>,
    );
    expect(screen.getByTestId('admin-sidebar')).toHaveAttribute('data-collapsed', '');
  });

  it('renderiza o conteúdo dentro do main', () => {
    render(<AdminLayout role="ADMIN">painel de programas</AdminLayout>);
    expect(within(screen.getByRole('main')).getByText('painel de programas')).toBeInTheDocument();
  });

  it('permite desligar o skip-link quando o layout pai já tem um', () => {
    render(
      <AdminLayout role="ADMIN" showSkipLink={false}>
        conteúdo
      </AdminLayout>,
    );
    expect(screen.queryByTestId('skip-link')).toBeNull();
  });
});

describe('Server Components renderizam sem runtime de cliente', () => {
  it('Footer sai como HTML estático', () => {
    const html = renderToStaticMarkup(<Footer year={2026} />);
    expect(html).toContain('© 2026 Reiners Media');
    expect(html).toContain('aria-label="Reiners Media no YouTube"');
  });

  it('SkipLink sai como HTML estático', () => {
    const html = renderToStaticMarkup(<SkipLink />);
    expect(html).toContain(`href="#${MAIN_CONTENT_ID}"`);
    expect(html).toContain('sr-only-focusable');
  });

  it('AdminLayout renderiza no servidor (a sidebar hidrata depois)', () => {
    const html = renderToStaticMarkup(
      <AdminLayout role="EDITOR" sidebarProps={{ pathname: '/admin' }}>
        conteúdo
      </AdminLayout>,
    );
    expect(html).toContain(`id="${MAIN_CONTENT_ID}"`);
    // BR-001 já vale no HTML entregue: a rota nem aparece na resposta.
    expect(html).not.toContain('/admin/users');
  });
});
