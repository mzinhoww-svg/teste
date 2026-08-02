'use client';

/**
 * TCK-009 — Navegação lateral do painel administrativo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RBAC (BR-001): O PAPEL CHEGA POR PROP, E ESCONDER NÃO É PROTEGER
 * ─────────────────────────────────────────────────────────────────────────────
 * `role` é uma prop obrigatória. Esta sidebar NÃO busca sessão, não lê cookie e
 * não chama `/api/auth/session`: é um Client Component, e qualquer leitura de
 * sessão aqui seria (a) uma chamada de rede por navegação e (b) uma segunda
 * fonte de verdade sobre quem é o usuário, divergindo do middleware na primeira
 * troca de papel. Quem resolve a sessão é o layout do servidor (TCK-017), que
 * passa o papel já validado para cá.
 *
 * O item `Usuários` (`/admin/users`) é ADMIN-only e some para o EDITOR. Isso é
 * ERGONOMIA, não segurança — a barreira real é o middleware + as rotas de API
 * (`ADMIN_ONLY_PATH_PREFIXES` em `src/lib/auth-helpers.ts`). Um EDITOR que
 * digite a URL na mão continua batendo em 403; o que o filtro evita é oferecer
 * a ele um caminho que termina em erro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COLAPSO
 * ─────────────────────────────────────────────────────────────────────────────
 * Colapsada, a barra mostra só ícones — mas o NOME ACESSÍVEL DE CADA LINK
 * CONTINUA LÁ, num `<span className="sr-only">`. Trocar o rótulo por um ícone
 * "porque tem tooltip" é o erro clássico: tooltip é descrição, não nome, e
 * comando de voz ("clique em Episódios") deixa de funcionar.
 *
 * O componente aceita os dois modos:
 *   - NÃO CONTROLADO: `defaultCollapsed` — a sidebar guarda o próprio estado;
 *   - CONTROLADO: `collapsed` + `onCollapsedChange` — quando TCK-017 precisar
 *     persistir a preferência (cookie/localStorage) sem duplicar estado.
 *
 * O gatilho usa `aria-expanded` + `aria-controls` (padrão APG "Disclosure"):
 * o que aparece e some com o toggle é o TEXTO da navegação, e é isso que
 * `aria-expanded` anuncia. O rótulo do botão também muda ("Recolher"/"Expandir")
 * para quem não ouve o estado.
 */
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useId, useState, type ReactNode } from 'react';

import { buttonVariants, cn } from '@/components/ui';
import type { AdminRole } from '@/types/api';

import {
  ADMIN_NAV_ITEMS,
  ariaCurrentFor,
  visibleAdminNavItems,
  type AdminNavItem,
} from './nav-config';

export interface AdminSidebarProps {
  /**
   * Papel do usuário autenticado, resolvido no servidor (TCK-017).
   * Obrigatório: sem ele não há como aplicar BR-001, e um default silencioso
   * ('EDITOR' ou 'ADMIN') seria uma decisão de segurança tomada por descuido.
   */
  role: AdminRole;
  /** Itens do menu. Default: `ADMIN_NAV_ITEMS`. */
  items?: readonly AdminNavItem[];
  /** Rota atual. Ausente = `usePathname()`. */
  pathname?: string | null;
  /** Estado colapsado CONTROLADO. Quando presente, `defaultCollapsed` é ignorado. */
  collapsed?: boolean;
  /** Estado inicial no modo não controlado. */
  defaultCollapsed?: boolean;
  /** Notifica a mudança nos dois modos. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Rótulo acessível do landmark de navegação. */
  ariaLabel?: string;
  /** Cabeçalho da barra (marca, nome do painel). */
  header?: ReactNode;
  /** Rodapé da barra (usuário, sair). */
  footer?: ReactNode;
  className?: string;
}

export function AdminSidebar({
  role,
  items = ADMIN_NAV_ITEMS,
  pathname,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  ariaLabel = 'Navegação do painel',
  header,
  footer,
  className,
}: AdminSidebarProps) {
  const routerPathname = usePathname();
  const currentPath = pathname ?? routerPathname;

  const [uncontrolled, setUncontrolled] = useState(defaultCollapsed);
  const isControlled = collapsed !== undefined;
  // `??` e não um ternário sobre `isControlled`: o TS não estreita `collapsed`
  // através de um booleano intermediário, e o ternário devolveria
  // `boolean | undefined`.
  const isCollapsed = collapsed ?? uncontrolled;

  const reactId = useId();
  const navId = `${reactId}-admin-nav`;

  const toggle = useCallback(() => {
    const next = !isCollapsed;
    if (!isControlled) setUncontrolled(next);
    onCollapsedChange?.(next);
  }, [isCollapsed, isControlled, onCollapsedChange]);

  // BR-001 — o filtro é aplicado ANTES de renderizar. Nada de esconder com CSS:
  // `display: none` continua no DOM e vaza a existência da rota no HTML.
  const visibleItems = visibleAdminNavItems(items, role);

  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      data-testid="admin-sidebar"
      data-role={role}
      data-collapsed={isCollapsed ? '' : undefined}
      className={cn(
        'flex h-full flex-col gap-4 bg-surface-raised py-4',
        // Limite real (>= 3:1). A barra encosta no conteúdo do painel, então a
        // borda é o único separador — `border-line-subtle` reprovaria (1.4.11).
        'border-e border-line-default',
        'transition-[width] duration-normal ease-standard',
        isCollapsed ? 'w-16 px-2' : 'w-64 px-4',
        className,
      )}
    >
      {header ? (
        <div className={cn('flex items-center', isCollapsed && 'justify-center')}>{header}</div>
      ) : null}

      <nav id={navId} aria-label={ariaLabel} className="flex-1">
        <ul className="flex flex-col gap-1">
          {visibleItems.map((item) => (
            <li key={item.href}>
              <AdminNavLink item={item} pathname={currentPath} collapsed={isCollapsed} />
            </li>
          ))}
        </ul>
      </nav>

      {footer ? <div className="mt-auto">{footer}</div> : null}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={!isCollapsed}
        aria-controls={navId}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'justify-start gap-3',
          isCollapsed && 'justify-center px-0',
        )}
      >
        <ToggleIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className={cn(isCollapsed && 'sr-only')}>
          {isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        </span>
      </button>
    </aside>
  );
}

interface AdminNavLinkProps {
  item: AdminNavItem;
  pathname: string | null | undefined;
  collapsed: boolean;
}

/**
 * Item da navegação do painel.
 *
 * O estado atual é comunicado por TRÊS canais independentes, porque cada um
 * atinge um público diferente:
 *   - `aria-current="page"` → tecnologia assistiva;
 *   - superfície + peso da fonte → visão;
 *   - borda de acento (`border-line-accent`) → quem não distingue as cores
 *     (WCAG 2.2 §1.4.1 — cor nunca sozinha).
 */
function AdminNavLink({ item, pathname, collapsed }: AdminNavLinkProps) {
  const current = ariaCurrentFor(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={current}
      // `title` só quando colapsado: para o ponteiro. O NOME acessível vem
      // sempre do `<span>` abaixo, nunca do `title`.
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md border-s-2 py-2 text-sm font-medium',
        'transition-colors duration-fast ease-standard',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus',
        collapsed ? 'justify-center px-2' : 'px-3',
        current
          ? 'border-line-accent bg-surface-accent text-content-primary'
          : 'border-transparent text-content-secondary hover:bg-surface-sunken hover:text-content-primary',
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
}
