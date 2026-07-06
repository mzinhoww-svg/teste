"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationRow } from "@/lib/db";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function NotificationBell({ items, unread }: { items: NotificationRow[]; unread: number }) {
  const [, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:bg-slate-800"
        aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 origin-center animate-badge-pop place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white motion-reduce:animate-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="px-0 py-0 text-sm font-semibold text-slate-800">Notificações</DropdownMenuLabel>
          {unread > 0 && (
            <button
              onClick={() => start(() => markAllNotificationsRead())}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar todas
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">Nenhuma notificação ainda.</p>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.action_url ?? "/app/notifications"}
                onClick={() => { if (!n.read_at) start(() => markNotificationRead(n.id)); }}
                className={`block border-b border-slate-50 px-3 py-2.5 last:border-0 hover:bg-slate-50 ${n.read_at ? "" : "bg-brand-50/40"}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{n.title}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <Link href="/app/notifications" className="block px-3 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50">
          Ver todas
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
