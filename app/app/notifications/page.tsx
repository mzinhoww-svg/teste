import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Badge } from "@/components/ui/badge";
import { getNotifications } from "@/lib/db";
import { markAllNotificationsRead } from "@/app/actions";

export const metadata = { title: "Notificações — CRM AI Studio" };

const typeLabel: Record<string, string> = {
  cadence: "Cadência", deal_won: "Ganho", deal_lost: "Perdido", deal_stage: "Funil",
  invite_created: "Convite", member_joined: "Membro", contract: "Contrato",
  contract_signed: "Assinatura", agent_error: "Agente", info: "Info",
};

export default async function NotificationsPage({ searchParams }: { searchParams: { filter?: string } }) {
  const all = await getNotifications(100);
  const filter = searchParams.filter ?? "all";
  const items = filter === "unread" ? all.filter((n) => !n.read_at) : all;
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

        <div className="mb-4 flex gap-2 text-xs">
          {[["all", "Todas"], ["unread", `Não lidas (${unread})`]].map(([v, l]) => (
            <Link key={v} href={v === "all" ? "/app/notifications" : `/app/notifications?filter=${v}`}
              className={`rounded-full px-3 py-1.5 font-medium ${filter === v ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
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
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {items.map((n) => (
              <Link key={n.id} href={n.action_url ?? "/app"}
                className={`flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50 ${n.read_at ? "" : "bg-brand-50/40"}`}>
                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                <div className={`min-w-0 flex-1 ${n.read_at ? "pl-5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="muted" className="text-[10px]">{typeLabel[n.type] ?? n.type}</Badge>
                    <span className="text-sm font-medium text-slate-800">{n.title}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{String(n.created_at).slice(0, 16).replace("T", " ")}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
