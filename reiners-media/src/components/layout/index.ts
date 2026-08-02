/**
 * TCK-009 — Superfície pública do sistema de layout.
 *
 * Consumo (TCK-011, TCK-012, TCK-016, TCK-017):
 *
 *     import { Navbar, Footer, MAIN_CONTENT_ID } from '@/components/layout';
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATO COM AS PÁGINAS — leia antes de montar um layout de segmento
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. O `<main>` da página PRECISA ser `id={MAIN_CONTENT_ID}` e `tabIndex={-1}`.
 *    O skip-link da `Navbar`/`AdminLayout` aponta para ele; sem o id o link
 *    não vai a lugar nenhum, e sem o `tabIndex` o WebKit rola a página mas
 *    deixa o foco no `<body>` (WCAG 2.2 §2.4.1).
 *
 *        <Navbar />
 *        <main id={MAIN_CONTENT_ID} tabIndex={-1}>…</main>
 *        <Footer />
 *
 * 2. `Navbar` e `AdminSidebar` já renderizam um skip-link. Se o layout pai
 *    renderizar o seu, passe `showSkipLink={false}` para não duplicar.
 *
 * 3. Rota ativa: os componentes leem `usePathname()` sozinhos. A prop
 *    `pathname` existe para teste e para forçar o estado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER vs CLIENT (App Router)
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER (zero JS no cliente): `Footer`, `SkipLink`, `AdminLayout` e todo o
 * módulo `nav-config` (tipos, defaults e as funções puras de match/RBAC).
 *
 * CLIENT: `Navbar` (scroll + drawer), `MobileDrawer` (foco preso) e
 * `AdminSidebar` (colapso). Renderizá-los dentro de um Server Component
 * funciona; o que NÃO funciona é o Server Component passar função para eles
 * (ex.: `onCollapsedChange`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRAS DO DESIGN SYSTEM APLICADAS AQUI
 * ─────────────────────────────────────────────────────────────────────────────
 *   - só tokens semânticos (`bg-surface-raised`, nunca `bg-zinc-900`);
 *   - nenhum hex fora de `src/lib/tokens.ts`;
 *   - limite de componente = `border-line-default` ou `shadow-raised`, jamais
 *     `border-line-subtle` sozinho (decorativo, ~1.1:1 — WCAG 2.2 §1.4.11);
 *   - movimento por `@/lib/animations` + `useReducedMotion`, nunca por duração
 *     ou curva escrita à mão.
 *
 * `tests/unit/components/layout/design-system.test.ts` falha se alguma dessas
 * regras for quebrada dentro de `src/components/layout/`.
 */

export {
  ADMIN_NAV_ITEMS,
  FOOTER_NAV_GROUPS,
  MAIN_CONTENT_ID,
  NAV_ROLE_RANK,
  PRIMARY_NAV_ITEMS,
  SOCIAL_LINKS,
  ariaCurrentFor,
  canSeeNavItem,
  externalLinkProps,
  isActiveHref,
  visibleAdminNavItems,
  type AdminNavItem,
  type NavEmphasis,
  type NavGroup,
  type NavItem,
  type SocialLink,
} from './nav-config';

export { SkipLink, type SkipLinkProps } from './skip-link';
export { MobileDrawer, type MobileDrawerProps } from './mobile-drawer';
export {
  DESKTOP_NAV_QUERY,
  Navbar,
  SCROLL_ELEVATION_THRESHOLD,
  type NavbarProps,
} from './navbar';
export { Footer, type FooterProps } from './footer';
export { AdminSidebar, type AdminSidebarProps } from './admin-sidebar';
export { AdminLayout, type AdminLayoutProps } from './admin-layout';
