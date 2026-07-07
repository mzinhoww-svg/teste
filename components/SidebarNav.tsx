"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Filter, Users, Building2, FileSignature, FolderKanban, PackageCheck,
  Receipt, BarChart3, Zap, Bot, Settings, ScrollText, HelpCircle, CheckSquare, Inbox, Target, Trophy, type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/nav-items";

const ICONS: Record<string, LucideIcon> = {
  Filter, Users, Building2, FileSignature, FolderKanban, PackageCheck,
  Receipt, BarChart3, Zap, Bot, Settings, ScrollText, HelpCircle, CheckSquare, Inbox, Target, Trophy,
};

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// Navegação agrupada com realce por rota (usePathname — precisa ser client).
// Reusada na sidebar (desktop) e no drawer (mobile) via `onNavigate`.
export function SidebarNav({ canManage, onNavigate }: { canManage: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => canManage || !i.adminOnly);
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.title}</div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? Filter;
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
