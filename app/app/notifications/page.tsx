import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Nav } from "@/components/Nav";
import { getNotifications } from "@/lib/db";
import { markAllNotificationsRead } from "@/app/actions";
import { NotificationItem } from "@/components/notifications/NotificationItem";

export const metadata = { title: "Notificações — CRM AI Studio" };

const FILTERS: Record<string, (t: string) => boolean> = {
  all: () => true,
  agents: (t) => t === "agent_suggestion" || t === "lead_incomplete" || t === "agent_error",
  contracts: (t) => t.startsWith("contract"),
  atrasos: (t) => t === "cadence" || t === "deal_stage",
};

export default async function NotificationsPage({ searchParams }: { searchParams: { filter?: string } }) {
  const all = await getNotifications(100);
  const filter = searchParams.filter ?? "all";
  const items = filter === "unread" ? all.filter((n) => !n.read_at) : all.filter((n) => (FILTERS[filter] ?? FILTERS.all)(n.type));
  const unread = all.filter((n) => !n.read_at).length;

  async function markAll() {
    "use server";
    await markAllNotificationsRead();
  }

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Notificações</h1>
            <p className="text-sm text-slate-500">Tudo que precisa da sua atenção nesta organização.</p>
          </div>
          {unread > 0 && (
            <form action={markAll}>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <CheckCheck className="h-4 w-4" aria-hidden /> Marcar todas como lidas
              </button>
            </form>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {[["all", "Todas"], ["unread", `Não lidas (${unread})`], ["agents", "Agentes"], ["contracts", "Contratos"], ["atrasos", "Funil & atrasos"]].map(([v, l]) => (
            <Link key={v} href={v === "all" ? "/app/notifications" : `/app/notifications?filter=${v}`}
              className={`rounded-full px-3 py-1.5 font-medium ${filter === v ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"}`}>
              {l}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
              <Bell className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm text-slate-500">
              {filter === "unread" ? "Nenhuma notificação não lida." : "Nenhuma notificação ainda. Movimentações no funil, cadências e contratos aparecem aqui."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {items.map((n) => <NotificationItem key={n.id} n={n} />)}
          </div>
        )}
      </main>
    </div>
  );
}
