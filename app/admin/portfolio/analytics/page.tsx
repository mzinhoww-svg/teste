import Link from "next/link";
import { getDashboardStats, listEvents } from "@/lib/portfolio/data";
import { EVENT_TYPES, isEventType, type EventType } from "@/lib/portfolio/types";
import { Card, PageTitle } from "@/components/portfolio/admin/AdminUI";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const EVENT_LABEL: Record<EventType, string> = {
  PAGE_VIEW: "Visualização de página",
  CARD_EXPAND: "Expansão de card",
  YOUTUBE_CLICK: "Clique YouTube",
  SPOTIFY_CLICK: "Clique Spotify",
  EPISODE_PLAY: "Play de episódio",
};

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { type?: string; from?: string; to?: string };
}) {
  const eventType = isEventType(searchParams.type) ? searchParams.type : undefined;
  const from = parseDate(searchParams.from);
  const to = parseDate(searchParams.to);

  const [events, stats] = await Promise.all([
    listEvents({ eventType, from, to, take: PAGE_SIZE }),
    getDashboardStats(),
  ]);

  const exportQuery = new URLSearchParams();
  if (eventType) exportQuery.set("type", eventType);
  if (searchParams.from) exportQuery.set("from", searchParams.from);
  if (searchParams.to) exportQuery.set("to", searchParams.to);

  return (
    <>
      <PageTitle
        title="Analytics"
        action={
          <Link
            href={`/api/portfolio/analytics/export?${exportQuery.toString()}`}
            className="inline-flex min-h-[44px] items-center rounded-pf-md border border-pf-muted/[0.15] px-4 text-pf-xl text-pf-primary transition-colors duration-pf-fast ease-pf hover:border-pf-inverse hover:text-pf-inverse"
          >
            Exportar CSV
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            Visualizações (30d)
          </p>
          <p className="pf-tabular mt-2 text-pf-panel font-medium text-pf-primary">
            {stats.series.reduce((n, d) => n + d.views, 0)}
          </p>
        </Card>
        <Card>
          <p className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            Expansões (30d)
          </p>
          <p className="pf-tabular mt-2 text-pf-panel font-medium text-pf-primary">
            {stats.series.reduce((n, d) => n + d.expands, 0)}
          </p>
        </Card>
        <Card>
          <p className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            Cliques em trilha
          </p>
          <p className="pf-tabular mt-2 text-pf-panel font-medium text-pf-primary">
            {stats.trackClicks.youtube + stats.trackClicks.spotify}
          </p>
        </Card>
      </div>

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">Tipo</span>
            <select
              name="type"
              defaultValue={eventType ?? ""}
              className="min-h-[44px] rounded-pf-md border border-pf-muted/[0.08] bg-pf-strong px-3 text-pf-base text-pf-primary"
            >
              <option value="">Todos</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">De</span>
            <input
              type="date"
              name="from"
              defaultValue={searchParams.from ?? ""}
              className="min-h-[44px] rounded-pf-md border border-pf-muted/[0.08] bg-pf-strong px-3 text-pf-base text-pf-primary"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">Até</span>
            <input
              type="date"
              name="to"
              defaultValue={searchParams.to ?? ""}
              className="min-h-[44px] rounded-pf-md border border-pf-muted/[0.08] bg-pf-strong px-3 text-pf-base text-pf-primary"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base"
          >
            Filtrar
          </button>
        </form>
      </Card>

      <Card>
        {events.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-pf-muted/[0.08]">
                  <th className="py-2 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                    Quando
                  </th>
                  <th className="py-2 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                    Evento
                  </th>
                  <th className="py-2 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                    Payload
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-pf-muted/[0.06]">
                    <td className="pf-tabular py-2 text-pf-sm text-pf-primary/60">
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 text-pf-sm text-pf-primary">
                      {EVENT_LABEL[event.eventType] ?? event.eventType}
                    </td>
                    <td className="py-2 text-pf-sm text-pf-primary/60">
                      {event.payload ? JSON.stringify(event.payload) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-pf-sm text-pf-primary/30">
            {stats.databaseConfigured
              ? "Nenhum evento no período selecionado."
              : "Sem DATABASE_URL: a telemetria não está sendo gravada."}
          </p>
        )}
      </Card>
    </>
  );
}
