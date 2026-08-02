/**
 * TCK-009 — Footer: landmarks, nome acessível dos ícones sociais e copyright.
 *
 * O Footer é Server Component (sem `'use client'`), mas continua sendo uma
 * função React pura — `render` do Testing Library o executa normalmente. Se
 * alguém introduzir estado/efeito nele, este arquivo quebra junto com o build.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '@/components/layout/footer';
import { FOOTER_NAV_GROUPS, SOCIAL_LINKS } from '@/components/layout/nav-config';

describe('Footer', () => {
  it('é o landmark contentinfo, sem role redundante', () => {
    render(<Footer year={2026} />);
    const footer = screen.getByTestId('footer');

    expect(footer.tagName).toBe('FOOTER');
    // `<footer>` no topo do documento JÁ é `contentinfo`; declarar o role de
    // novo é ruído que alguns leitores anunciam duas vezes.
    expect(footer).not.toHaveAttribute('role');
  });

  describe('redes sociais', () => {
    it('todo link social tem nome acessível — ícone não é nome', () => {
      render(<Footer year={2026} />);
      const list = screen.getByRole('list', { name: 'Redes sociais' });
      const links = within(list).getAllByRole('link');

      expect(links).toHaveLength(SOCIAL_LINKS.length);
      for (const link of links) {
        const name = link.getAttribute('aria-label');
        expect(name, 'link social sem aria-label').toBeTruthy();
        expect(name?.trim().length).toBeGreaterThan(0);
      }
    });

    it('usa o rótulo declarado, com marca e plataforma', () => {
      render(<Footer year={2026} />);
      for (const social of SOCIAL_LINKS) {
        expect(screen.getByRole('link', { name: social.label })).toHaveAttribute(
          'href',
          social.href,
        );
      }
    });

    it('esconde o <svg> do leitor para não duplicar o rótulo', () => {
      render(<Footer year={2026} />);
      const link = screen.getByRole('link', { name: SOCIAL_LINKS[0]?.label ?? '' });
      const icon = link.querySelector('svg');

      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
    });

    it('abre em nova aba sem vazar window.opener', () => {
      render(<Footer year={2026} />);
      const link = screen.getByRole('link', { name: SOCIAL_LINKS[0]?.label ?? '' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('omite a lista quando não há redes', () => {
      render(<Footer year={2026} social={[]} />);
      expect(screen.queryByRole('list', { name: 'Redes sociais' })).toBeNull();
    });
  });

  describe('navegação secundária', () => {
    it('cada coluna é um landmark de navegação com nome próprio', () => {
      render(<Footer year={2026} />);
      const navs = screen.getAllByRole('navigation');

      expect(navs).toHaveLength(FOOTER_NAV_GROUPS.length);

      const names = navs.map((nav) => {
        const id = nav.getAttribute('aria-labelledby') ?? '';
        return document.getElementById(id)?.textContent;
      });

      expect(names).toEqual(FOOTER_NAV_GROUPS.map((group) => group.title));
      // Nomes distintos: com três "navegação" iguais o rotor fica inútil.
      expect(new Set(names).size).toBe(names.length);
    });

    it('renderiza todos os links declarados', () => {
      render(<Footer year={2026} />);
      for (const group of FOOTER_NAV_GROUPS) {
        const nav = screen.getByRole('navigation', { name: group.title });
        for (const item of group.items) {
          expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute(
            'href',
            item.href,
          );
        }
      }
    });

    it('aceita grupos customizados', () => {
      render(
        <Footer
          year={2026}
          groups={[{ title: 'Legal', items: [{ href: '/lgpd', label: 'LGPD' }] }]}
        />,
      );
      const nav = screen.getByRole('navigation', { name: 'Legal' });
      expect(within(nav).getByRole('link', { name: 'LGPD' })).toHaveAttribute('href', '/lgpd');
    });
  });

  describe('copyright', () => {
    it('exibe ano e razão social', () => {
      render(<Footer year={2026} />);
      expect(
        screen.getByText('© 2026 Reiners Media. Todos os direitos reservados.'),
      ).toBeInTheDocument();
    });

    it('o ano é injetável — o default não pode virar teste flaky em 31/12', () => {
      render(<Footer year={1999} companyName="Outro Estúdio" />);
      expect(
        screen.getByText('© 1999 Outro Estúdio. Todos os direitos reservados.'),
      ).toBeInTheDocument();
    });

    it('usa o ano corrente quando nenhum é passado', () => {
      render(<Footer />);
      expect(
        screen.getByText(new RegExp(`© ${new Date().getFullYear()} `)),
      ).toBeInTheDocument();
    });

    it('omite a linha jurídica quando não há uma', () => {
      const withoutNote = render(<Footer year={2026} />);
      expect(screen.queryByText(/CNPJ/)).toBeNull();
      withoutNote.unmount();

      render(<Footer year={2026} legalNote="CNPJ 00.000.000/0001-00" />);
      expect(screen.getByText('CNPJ 00.000.000/0001-00')).toBeInTheDocument();
    });
  });

  it('separa-se do conteúdo com borda de limite acessível', () => {
    // `border-line-subtle` é ~1.1:1 e reprovaria em WCAG 2.2 §1.4.11 como
    // único indicador de limite.
    render(<Footer year={2026} />);
    const footer = screen.getByTestId('footer');
    expect(footer.className).toContain('border-line-default');
    expect(footer.className).not.toContain('border-line-subtle');
  });
});
