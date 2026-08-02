"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { palette } from "@/lib/portfolio/tokens";

// Gráfico do dashboard: page views (accent, série primária) x expansões de card
// (text.primary a 30%, série secundária) — spec §9.
//
// Recharts precisa de valores de cor concretos em props (não aceita classes
// Tailwind), então importa direto do módulo de tokens — que segue sendo a
// única fonte de hex do módulo.

export function DashboardChart({
  data,
}: {
  data: { date: string; views: number; expands: number }[];
}) {
  const axis = { stroke: palette.textPrimary, opacity: 0.5, fontSize: 11 };

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={palette.borderMuted} strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="date"
            tick={axis}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)}
            minTickGap={24}
          />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip
            contentStyle={{
              background: palette.surfaceRaised,
              border: `1px solid ${palette.textInverse}`,
              borderRadius: 12,
              color: palette.textPrimary,
              fontSize: 12,
            }}
            labelStyle={{ color: palette.textPrimary }}
          />
          <Line
            type="monotone"
            dataKey="views"
            name="Visualizações"
            stroke={palette.textInverse}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="expands"
            name="Expansões de card"
            stroke={palette.textPrimary}
            strokeOpacity={0.3}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
