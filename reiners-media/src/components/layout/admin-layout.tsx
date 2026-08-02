/**
 * TCK-009 — Casca do painel administrativo.
 *
 * SERVER COMPONENT. Ele só compõe: sidebar (Client) + `<main>`. A sessão é
 * resolvida por quem o usa (`src/app/admin/layout.tsx`, TCK-017), que passa o
 * `role` já validado — ver o docblock de `./admin-sidebar.tsx` sobre por que o
 * papel NÃO é buscado no cliente.
 *
 * O que este arquivo garante e que é fácil esquecer numa casca de admin:
 *
 *  1. SKIP LINK também aqui. A sidebar tem ~6 links repetidos em toda página do
 *     painel; sem bypass, o usuário de teclado tabula por todos eles antes de
 *     alcançar o formulário que veio editar (WCAG 2.2 §2.4.1).
 *  2. `<main id={MAIN_CONTENT_ID} tabIndex={-1}>` — o `tabIndex` é o que faz o
 *     foco realmente ir para o conteúdo no WebKit, e não só o scroll.
 *  3. UM ÚNICO `<main>` por página (o painel não deve aninhar outro).
 *
 * Não existe Navbar pública aqui de propósito: o painel tem sua própria
 * navegação e misturar as duas confunde a orientação do usuário.
 */
import type { ReactNode } from 'react';

import { cn } from '@/components/ui';
import type { AdminRole } from '@/types/api';

import { AdminSidebar, type AdminSidebarProps } from './admin-sidebar';
import { MAIN_CONTENT_ID } from './nav-config';
import { SkipLink } from './skip-link';

export interface AdminLayoutProps {
  /** Papel do usuário autenticado, resolvido no servidor. Aplica BR-001. */
  role: AdminRole;
  children: ReactNode;
  /**
   * Repassado à `AdminSidebar` (itens, colapso, header, footer).
   *
   * ATENÇÃO: `AdminLayout` é Server Component e `AdminSidebar` é Client. Um
   * Server Component NÃO pode passar função pela fronteira — `onCollapsedChange`
   * daqui explodiria em "Functions cannot be passed to Client Components".
   * Para colapso controlado, envolva a sidebar num Client Component seu e use
   * `AdminSidebar` diretamente.
   */
  sidebarProps?: Omit<AdminSidebarProps, 'role'>;
  /** Esconde o skip link (use se o layout pai já renderiza um). */
  showSkipLink?: boolean;
  className?: string;
  /** Classe do `<main>` — útil para largura máxima por rota. */
  mainClassName?: string;
}

export function AdminLayout({
  role,
  children,
  sidebarProps,
  showSkipLink = true,
  className,
  mainClassName,
}: AdminLayoutProps) {
  return (
    <div className={cn('relative flex min-h-screen w-full bg-surface-base', className)}>
      {showSkipLink ? <SkipLink /> : null}

      <AdminSidebar role={role} {...sidebarProps} />

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cn('min-w-0 flex-1 px-4 py-8 md:px-8', mainClassName)}
      >
        {children}
      </main>
    </div>
  );
}
