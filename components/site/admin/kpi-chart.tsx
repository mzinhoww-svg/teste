"use client";

import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Gráfico de linha do dashboard do CMS. Cor primária = text.inverse; a série
// secundária usa text.primary a 40% para não competir. Lê os tokens do CSS em
// runtime — nenhum hex cru aqui.

const ACCENT = "rgb(216 125 255)";
const MUTED = "rgb(252 252 252 / 0.4)";
const GRID = "rgb(255 255 255 / 0.06)";

export function KpiChart({ data }: { data: { day: string; views: number; clicks: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-site-sm text-site-text-primary/55">
        Sem eventos registrados ainda.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            stroke={MUTED}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis stroke={MUTED} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "rgb(20 16 28)",
              border: "1px solid rgb(255 255 255 / 0.1)",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "rgb(252 252 252)" }}
          />
          <Line type="monotone" dataKey="views" name="Visitas" stroke={ACCENT} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="clicks" name="Cliques em CTA" stroke={MUTED} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
