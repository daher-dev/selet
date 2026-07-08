"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/format";

interface MonthBucket {
  label: string;
  in: number;
  out: number;
  avgTicket: number;
  activeCustomers: number;
}

const AXIS_STYLE = {
  fontSize: 10.5,
  fill: "#8a968d",
  fontFamily: "var(--font-albert)",
};

function brlShort(centavos: number): string {
  const value = centavos / 100;
  if (value >= 1000) return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function EntradaSaidaChart({ months }: { months: MonthBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={months} margin={{ top: 4, right: 0, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef3ea" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={brlShort} />
        <Tooltip
          formatter={(value, name) => [
            formatBRL(Number(value)),
            name === "in" ? "Entradas" : "Saídas",
          ]}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #e7eee6",
            fontSize: 12,
            fontFamily: "var(--font-albert)",
          }}
        />
        <Bar isAnimationActive={false} dataKey="in" fill="#92c17d" radius={[5, 5, 0, 0]} maxBarSize={18} />
        <Bar isAnimationActive={false} dataKey="out" fill="#e2c089" radius={[5, 5, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TicketChart({ months }: { months: MonthBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={months} margin={{ top: 4, right: -8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef3ea" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="ticket"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={brlShort}
        />
        <YAxis
          yAxisId="customers"
          orientation="right"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          formatter={(value, name) =>
            name === "avgTicket"
              ? [formatBRL(Number(value)), "Ticket médio"]
              : [String(value), "Clientes ativos"]
          }
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #e7eee6",
            fontSize: 12,
            fontFamily: "var(--font-albert)",
          }}
        />
        <Bar
          yAxisId="customers"
          isAnimationActive={false}
          dataKey="activeCustomers"
          fill="#d6e7cc"
          radius={[5, 5, 0, 0]}
          maxBarSize={18}
        />
        <Line
          yAxisId="ticket"
          type="monotone"
          isAnimationActive={false}
          dataKey="avgTicket"
          stroke="#186b41"
          strokeWidth={2}
          dot={{ r: 3, fill: "#186b41" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
