/**
 * TCK-009 — Vocabulário compartilhado do sistema de layout.
 *
 * Este módulo é a única fonte de verdade sobre "o que é um item de navegação"
 * no projeto. Ele é deliberadamente livre de JSX e de `'use client'`: assim ele
 * pode ser importado tanto pelo `Footer` (Server Component) quanto pela
 * `Navbar` e pela `AdminSidebar` (Client Components) sem arrastar runtime para
 * o bundle de quem não precisa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A DETECÇÃO DE ROTA ATIVA MORA AQUI (e não dentro de cada componente)
 * ─────────────────────────────────────────────────────────────────────────────
 * `aria-current="page"` é a única pista que o leitor de tela tem de "você está
 * aqui" (WCAG 2.2 §2.4.8 Location, técnica ARIA63). Errar a regra de match
 * significa marcar duas páginas como atuais — ou nenhuma. Centralizar a regra
 * numa função pura torna o comportamento testável sem montar um roteador.
 *
 * Regras de match, com a justificativa de cada uma:
 *
 *  1. `'/'` é sempre EXATO. Todo pathname começa com `/`; sem essa exceção a
 *     home ficaria marcada como atual em todas as páginas do site.
 *  2. Rotas de segmento casam por PREFIXO DE SEGMENTO: `/portfolio` é atual em
 *     `/portfolio/talk-show`, mas NÃO em `/portfolio-antigo`. O prefixo é
 *     comparado com a barra (`/portfolio/`), nunca como substring solta.
 *  3. `exact: true` desliga o prefixo. É o que o item `/admin` precisa, senão o
 *     "Painel" ficaria aceso junto com "Programas" em `/admin/podcasts`.
 *  4. Links com FRAGMENTO (`/#servicos`) NUNCA são `aria-current="page"`. Uma
 *     âncora aponta para um trecho da MESMA página; marcar quatro âncoras da
 *     landing como "página atual" simultaneamente é pior que não marcar
 *     nenhuma. (`aria-current="location"` seria o valor correto, mas depende de
 *     scroll-spy, que é escopo de TCK-011/012 — a API já aceita o override.)
 *  5. Links EXTERNOS nunca são atuais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RBAC (BR-001)
 * ─────────────────────────────────────────────────────────────────────────────
 * `requiredRole` filtra itens da navegação do admin. Isto é ESCONDER, não
 * PROTEGER: a autorização de verdade é do middleware e das rotas de API
 * (TCK-004, `ADMIN_ONLY_PATH_PREFIXES` em `src/lib/auth-helpers.ts`). Esconder
 * o link evita que o EDITOR bata numa parede 403; ele nunca substitui a parede.
 *
 * O rank é redeclarado aqui de propósito, em vez de importado de
 * `auth-helpers.ts`: aquele módulo carrega rate limit, Supabase e leitura de
 * cookie, e a `AdminSidebar` é um Client Component. Importá-lo mandaria código
 * de servidor para o browser. O tipo `AdminRole` continua vindo do contrato
 * (`@/types/api`) via `import type`, que é apagado na compilação.
 */
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Instagram,
  LayoutDashboard,
  Linkedin,
  ListMusic,
  Mic,
  Settings,
  Users,
  Youtube,
} from 'lucide-react';

import type { AdminRole } from '@/types/api';

/* ========================================================================== */
/* 1. Contratos                                                               */
/* ========================================================================== */

/**
 * Id do elemento `<main>` da página. O skip-link aponta para ele, então o
 * layout de segmento (TCK-011/012/017) PRECISA usar exatamente este id:
 *
 *     <main id={MAIN_CONTENT_ID} tabIndex={-1}>…</main>
 *
 * `tabIndex={-1}` é obrigatório: sem ele, browsers baseados em WebKit movem o
 * scroll mas não o foco, e o próximo Tab volta para o começo do documento.
 */
export const MAIN_CONTENT_ID = 'conteudo-principal';

/** Ênfase visual do item. `cta` vira um link COM CARA de botão — nunca um `<Button>` dentro de `<a>`. */
export type NavEmphasis = 'link' | 'cta';

export interface NavItem {
  /** Destino. Pode ser rota interna, âncora (`/#servicos`) ou URL absoluta. */
  readonly href: string;
  /** Rótulo visível — é também o nome acessível do link. */
  readonly label: string;
  /** Abre em nova aba e recebe `rel="noopener noreferrer"`. */
  readonly external?: boolean;
  /** Aparência. Default `'link'`. */
  readonly emphasis?: NavEmphasis;
  /** Desliga o match por prefixo de segmento (regra 3 do docblock). */
  readonly exact?: boolean;
  /** Texto auxiliar, usado nas colunas do rodapé. */
  readonly description?: string;
}

/** Coluna do rodapé: um título de grupo + seus links. */
export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/**
 * Rede social. `label` NÃO é opcional: o link é um ícone, e ícone não tem nome
 * acessível. Sem `aria-label` o leitor de tela anuncia "link" e o comando de
 * voz não tem como referenciar o alvo (WCAG 2.2 §2.4.4 e §4.1.2).
 */
export interface SocialLink {
  readonly href: string;
  /** Nome acessível completo — ex.: "Reiners Media no YouTube". */
  readonly label: string;
  /** Ícone da rede. Renderizado com `aria-hidden`, pois o nome vem do `label`. */
  readonly icon: LucideIcon;
}

/** Item da navegação do painel: um `NavItem` com ícone e nível de acesso. */
export interface AdminNavItem extends NavItem {
  readonly icon: LucideIcon;
  /** Papel MÍNIMO para ver o item. Ausente = visível para qualquer papel. */
  readonly requiredRole?: AdminRole;
}

/* ========================================================================== */
/* 2. Match de rota ativa                                                     */
/* ========================================================================== */

/** `'/portfolio/'` → `'/portfolio'`; `'/'` continua `'/'`. */
function normalizePath(value: string): string {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }
  return value;
}

/** `true` para `http(s)://`, `mailto:`, `tel:` — nada disso é rota interna. */
function isAbsolute(href: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href) || href.startsWith('//');
}

/**
 * `true` quando `href` representa a página em `pathname`.
 *
 * Função PURA: nenhum acesso a `window`, `usePathname` ou roteador. Isso é o
 * que permite testar as cinco regras do docblock sem montar o App Router.
 */
export function isActiveHref(
  pathname: string | null | undefined,
  href: string,
  options: { readonly exact?: boolean } = {},
): boolean {
  if (!pathname) return false;
  // Regras 4 e 5: âncora e link externo não são "página atual".
  if (href.includes('#') || isAbsolute(href)) return false;

  const current = normalizePath(pathname);
  const target = normalizePath(href);

  // Regra 1: a home só é atual nela mesma.
  if (target === '/') return current === '/';
  if (current === target) return true;

  // Regra 3.
  if (options.exact) return false;

  // Regra 2: prefixo de SEGMENTO — a barra final impede `/portfolio-antigo`.
  return current.startsWith(`${target}/`);
}

/** Valor de `aria-current` do item, ou `undefined` quando ele não é o atual. */
export function ariaCurrentFor(
  pathname: string | null | undefined,
  item: Pick<NavItem, 'href' | 'exact'>,
): 'page' | undefined {
  return isActiveHref(pathname, item.href, { exact: item.exact }) ? 'page' : undefined;
}

/** Atributos de segurança de link externo (`target="_blank"` sem `rel` vaza `window.opener`). */
export function externalLinkProps(
  external: boolean | undefined,
): { target: '_blank'; rel: 'noopener noreferrer' } | Record<string, never> {
  return external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

/* ========================================================================== */
/* 3. RBAC da navegação do painel (BR-001)                                    */
/* ========================================================================== */

/**
 * Hierarquia de papéis. Espelha `ROLE_RANK` de `src/lib/auth-helpers.ts` — ver
 * o docblock do módulo para o motivo de não importar de lá.
 */
export const NAV_ROLE_RANK: Readonly<Record<AdminRole, number>> = {
  EDITOR: 1,
  ADMIN: 2,
};

/** `true` se `role` alcança o nível exigido pelo item. */
export function canSeeNavItem(item: AdminNavItem, role: AdminRole): boolean {
  const required = item.requiredRole;
  if (!required) return true;
  return NAV_ROLE_RANK[role] >= NAV_ROLE_RANK[required];
}

/** Itens do painel visíveis para `role`, preservando a ordem declarada. */
export function visibleAdminNavItems(
  items: readonly AdminNavItem[],
  role: AdminRole,
): readonly AdminNavItem[] {
  return items.filter((item) => canSeeNavItem(item, role));
}

/* ========================================================================== */
/* 4. Navegações padrão                                                       */
/* ========================================================================== */

/**
 * Navegação principal do site público. São DEFAULTS: TCK-011/012 podem passar
 * `items` próprios para a `Navbar` quando as rotas finais existirem.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Início', exact: true },
  { href: '/portfolio', label: 'Portfólio' },
  { href: '/#servicos', label: 'Serviços' },
  { href: '/#processo', label: 'Processo' },
  { href: '/#sobre', label: 'Sobre' },
  { href: '/#contato', label: 'Fale com a gente', emphasis: 'cta' },
];

/** Colunas do rodapé. */
export const FOOTER_NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Estúdio',
    items: [
      { href: '/#servicos', label: 'Serviços' },
      { href: '/#processo', label: 'Processo' },
      { href: '/#estrutura', label: 'Estrutura' },
      { href: '/#contato', label: 'Contato' },
    ],
  },
  {
    title: 'Programas',
    items: [
      { href: '/portfolio', label: 'Portfólio' },
      { href: '/#destaques', label: 'Destaques' },
      { href: '/#depoimentos', label: 'Depoimentos' },
    ],
  },
  {
    title: 'Institucional',
    items: [
      { href: '/#sobre', label: 'Sobre a Reiners' },
      { href: '/privacidade', label: 'Privacidade' },
      { href: '/termos', label: 'Termos de uso' },
    ],
  },
];

/**
 * Redes sociais. `label` traz o nome da marca porque o link é só um ícone; ver
 * o docblock de `SocialLink`.
 *
 * Os ícones vêm do lucide, que já mantém as marcas dessas plataformas — não
 * redesenhe logotipo de terceiro à mão aqui.
 */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    href: 'https://www.youtube.com/@reinersmedia',
    label: 'Reiners Media no YouTube',
    icon: Youtube,
  },
  {
    href: 'https://www.instagram.com/reinersmedia',
    label: 'Reiners Media no Instagram',
    icon: Instagram,
  },
  {
    href: 'https://www.linkedin.com/company/reinersmedia',
    label: 'Reiners Media no LinkedIn',
    icon: Linkedin,
  },
];

/**
 * Navegação do painel administrativo.
 *
 * `/admin/users` é o item ADMIN-only (BR-001) e o href casa exatamente com
 * `ADMIN_ONLY_PATH_PREFIXES` de `auth-helpers.ts` — se um dia a rota mudar de
 * lugar, os dois arquivos falham juntos em vez de divergirem em silêncio.
 */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Painel', icon: LayoutDashboard, exact: true },
  { href: '/admin/podcasts', label: 'Programas', icon: Mic },
  { href: '/admin/episodes', label: 'Episódios', icon: ListMusic },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  {
    href: '/admin/users',
    label: 'Usuários',
    icon: Users,
    requiredRole: 'ADMIN',
    description: 'Gestão de acessos — exclusivo do ADMIN (BR-001).',
  },
  { href: '/admin/settings', label: 'Configurações', icon: Settings },
];
