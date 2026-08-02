/**
 * TCK-009 — Regras puras de navegação: match de rota ativa e RBAC (BR-001).
 *
 * São funções puras justamente para poderem ser testadas sem montar o App
 * Router. Cada caso abaixo corresponde a uma das cinco regras documentadas em
 * `src/components/layout/nav-config.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  ADMIN_NAV_ITEMS,
  MAIN_CONTENT_ID,
  PRIMARY_NAV_ITEMS,
  ariaCurrentFor,
  canSeeNavItem,
  externalLinkProps,
  isActiveHref,
  visibleAdminNavItems,
  type AdminNavItem,
} from '@/components/layout/nav-config';

describe('isActiveHref', () => {
  it('regra 1: a home só é atual nela mesma', () => {
    expect(isActiveHref('/', '/')).toBe(true);
    // Sem a exceção da home, TODO pathname (que começa com "/") a marcaria.
    expect(isActiveHref('/portfolio', '/')).toBe(false);
    expect(isActiveHref('/admin/podcasts', '/')).toBe(false);
  });

  it('regra 2: casa por prefixo de SEGMENTO, não por substring', () => {
    expect(isActiveHref('/portfolio', '/portfolio')).toBe(true);
    expect(isActiveHref('/portfolio/talk-show', '/portfolio')).toBe(true);
    // O caso que uma comparação com `startsWith` solto erraria:
    expect(isActiveHref('/portfolio-antigo', '/portfolio')).toBe(false);
    expect(isActiveHref('/portfolios', '/portfolio')).toBe(false);
  });

  it('regra 3: `exact` desliga o prefixo', () => {
    expect(isActiveHref('/admin', '/admin', { exact: true })).toBe(true);
    expect(isActiveHref('/admin/podcasts', '/admin', { exact: true })).toBe(false);
    expect(isActiveHref('/admin/podcasts', '/admin')).toBe(true);
  });

  it('regra 4: âncora nunca é página atual', () => {
    // Quatro âncoras da landing marcadas como "página atual" ao mesmo tempo é
    // pior que nenhuma marcação.
    expect(isActiveHref('/', '/#servicos')).toBe(false);
    expect(isActiveHref('/', '/#contato')).toBe(false);
    expect(isActiveHref('/#servicos', '/#servicos')).toBe(false);
  });

  it('regra 5: link externo nunca é página atual', () => {
    expect(isActiveHref('/', 'https://exemplo.com/')).toBe(false);
    expect(isActiveHref('/contato', 'mailto:oi@reiners.media')).toBe(false);
    expect(isActiveHref('/contato', '//cdn.exemplo.com/x')).toBe(false);
  });

  it('ignora a barra final', () => {
    expect(isActiveHref('/portfolio/', '/portfolio')).toBe(true);
    expect(isActiveHref('/portfolio', '/portfolio/')).toBe(true);
  });

  it('devolve false sem pathname (SSR / fora do roteador)', () => {
    expect(isActiveHref(null, '/portfolio')).toBe(false);
    expect(isActiveHref(undefined, '/portfolio')).toBe(false);
    expect(isActiveHref('', '/portfolio')).toBe(false);
  });
});

describe('ariaCurrentFor', () => {
  it('devolve "page" no item atual e undefined nos demais', () => {
    expect(ariaCurrentFor('/portfolio', { href: '/portfolio' })).toBe('page');
    expect(ariaCurrentFor('/portfolio', { href: '/', exact: true })).toBeUndefined();
  });

  it('marca no máximo um item da navegação principal por rota', () => {
    // A garantia que impede "duas páginas atuais" na mesma view.
    for (const pathname of ['/', '/portfolio', '/portfolio/talk-show', '/privacidade']) {
      const marked = PRIMARY_NAV_ITEMS.filter(
        (item) => ariaCurrentFor(pathname, item) === 'page',
      );
      expect(marked.length, `${pathname} marcou ${marked.length} itens`).toBeLessThanOrEqual(1);
    }
  });

  it('marca exatamente um item do painel em cada rota do painel', () => {
    for (const pathname of [
      '/admin',
      '/admin/podcasts',
      '/admin/episodes',
      '/admin/analytics',
      '/admin/users',
      '/admin/settings',
    ]) {
      const marked = ADMIN_NAV_ITEMS.filter((item) => ariaCurrentFor(pathname, item) === 'page');
      expect(marked.map((item) => item.href), pathname).toHaveLength(1);
    }
  });
});

describe('externalLinkProps', () => {
  it('adiciona rel="noopener noreferrer" junto com target="_blank"', () => {
    // `target="_blank"` sem `rel` dá ao destino acesso a `window.opener`.
    expect(externalLinkProps(true)).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
  });

  it('não mexe em link interno', () => {
    expect(externalLinkProps(false)).toEqual({});
    expect(externalLinkProps(undefined)).toEqual({});
  });
});

describe('RBAC da navegação do painel (BR-001)', () => {
  const usersItem = ADMIN_NAV_ITEMS.find((item) => item.href === '/admin/users');

  it('o item de gestão de usuários existe e é ADMIN-only', () => {
    // Guarda da guarda: se alguém remover `requiredRole`, os testes de
    // filtragem abaixo passariam a validar o vazio.
    expect(usersItem, 'item /admin/users sumiu do menu').toBeDefined();
    expect(usersItem?.requiredRole).toBe('ADMIN');
  });

  it('EDITOR não vê o item ADMIN-only', () => {
    const visible = visibleAdminNavItems(ADMIN_NAV_ITEMS, 'EDITOR');
    expect(visible.map((item) => item.href)).not.toContain('/admin/users');
  });

  it('ADMIN vê todos os itens', () => {
    const visible = visibleAdminNavItems(ADMIN_NAV_ITEMS, 'ADMIN');
    expect(visible).toHaveLength(ADMIN_NAV_ITEMS.length);
    expect(visible.map((item) => item.href)).toContain('/admin/users');
  });

  it('preserva a ordem declarada ao filtrar', () => {
    const visible = visibleAdminNavItems(ADMIN_NAV_ITEMS, 'EDITOR');
    const expected = ADMIN_NAV_ITEMS.filter((item) => item.requiredRole !== 'ADMIN');
    expect(visible.map((item) => item.href)).toEqual(expected.map((item) => item.href));
  });

  it('item sem requiredRole é visível para qualquer papel', () => {
    const item = { href: '/x', label: 'X', icon: () => null } as unknown as AdminNavItem;
    expect(canSeeNavItem(item, 'EDITOR')).toBe(true);
    expect(canSeeNavItem(item, 'ADMIN')).toBe(true);
  });

  it('ADMIN alcança item que exige EDITOR (hierarquia, não igualdade)', () => {
    const item = {
      href: '/x',
      label: 'X',
      icon: () => null,
      requiredRole: 'EDITOR',
    } as unknown as AdminNavItem;
    expect(canSeeNavItem(item, 'ADMIN')).toBe(true);
    expect(canSeeNavItem(item, 'EDITOR')).toBe(true);
  });
});

describe('contrato com as páginas', () => {
  it('MAIN_CONTENT_ID é um id de fragmento válido', () => {
    // O skip-link monta `href={"#" + MAIN_CONTENT_ID}`; espaço ou "#" aqui
    // produziria um seletor quebrado.
    expect(MAIN_CONTENT_ID).toMatch(/^[a-z][\w-]*$/);
  });
});
