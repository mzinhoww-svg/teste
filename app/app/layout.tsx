import Link from "next/link";
import { getAuthContext, getNotifications, getUnreadCount } from "@/lib/db";
import { TenantThemeVars } from "@/components/TenantThemeVars";
import { TenantBadge, UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { SidebarNav } from "@/components/SidebarNav";
import { MobileSidebar } from "@/components/MobileSidebar";

// Shell do CRM: sidebar agrupada (uma vez) + topbar, envolvendo todas as páginas
// de /app/*. Substitui o antigo <Nav> por página. O realce do item ativo é feito
// no client (SidebarNav via usePathname).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const [notifs, unread] = ctx?.orgId
    ? await Promise.all([getNotifications(8), getUnreadCount()])
    : [[], 0];
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";
  const brandBar = ctx?.brand?.accent || ctx?.brand?.primary;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <TenantThemeVars primary={ctx?.brand?.primary} accent={ctx?.brand?.accent} />

      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-950">
        {brandBar && (
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${ctx?.brand?.primary ?? brandBar}, ${brandBar})` }} aria-hidden />
        )}
        <div className="px-4 py-4">
          <Link href="/app" className="flex items-center gap-2" aria-label="Início">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white" style={ctx?.brand?.primary ? { background: ctx.brand.primary } : undefined}>AI</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">CRM AI Studio</span>
          </Link>
        </div>
        {ctx && ctx.orgId && (
          <div className="px-3 pb-1">
            <TenantBadge orgName={ctx.orgName} memberships={ctx.memberships} activeOrgId={ctx.orgId} />
          </div>
        )}
        <SidebarNav canManage={canManage} />
      </aside>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:px-6">
          <div className="flex items-center gap-2">
            <MobileSidebar canManage={canManage} />
            <span className="text-sm font-semibold text-slate-900 md:hidden dark:text-slate-100">CRM AI Studio</span>
          </div>
          <div className="flex items-center gap-2">
            {ctx?.orgId && <NotificationBell items={notifs} unread={unread} />}
            {ctx && <UserMenu email={ctx.email} role={ctx.role} orgName={ctx.orgName || "—"} isTenantAdmin={ctx.role !== "member"} />}
          </div>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
