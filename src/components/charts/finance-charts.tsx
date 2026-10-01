"use client";

import type { MonthPoint } from "@/lib/dashboard-core";
import {
  AXIS_TEXT,
  ChartFrame,
  GRID,
  LABEL_TEXT,
  MONTH_TEXT,
  STRONG_TEXT,
  countAxisMax,
  kLabel,
  milLabel,
  niceMax,
} from "./chart-kit";

type FlowPoint = Pick<MonthPoint, "key" | "label" | "partial" | "in" | "out">;

/** R$ mil for the bar labels: whole from 10 mil up ("41"), else one decimal ("2,3"). */
function milInt(centavos: number): string {
  const mil = centavos / 100 / 1000;
  return mil >= 10 ? String(Math.round(mil)) : milLabel(centavos);
}

/** Paired Entradas (green) / Saídas (tan) bars per month, values in R$ mil. */
export function EntradaSaidaChart({ months }: { months: FlowPoint[] }) {
  return (
    <ChartFrame height={200} label="Entradas e saídas por mês">
      {(W) => {
        const left = 36;
        const top = 20;
        const base = 170;
        const slot = (W - left) / Math.max(1, months.length);
        const bw = Math.min(17, slot * 0.23);
        const gap = 4;
        const max = Math.max(0, ...months.flatMap((m) => [m.in / 100, m.out / 100]));
        const axisMax = niceMax(max, 4);
        const y = (reais: number) => base - (reais / axisMax) * (base - top);
        return (
          <>
            {[0, 1, 2, 3, 4].map((i) => {
              const t = (axisMax / 4) * i;
              return (
                <g key={i}>
                  <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} />
                  <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={10.5} fontWeight={500} fill={AXIS_TEXT}>
                    {kLabel(t)}
                  </text>
                </g>
              );
            })}
            {months.map((m, i) => {
              const cx = left + slot * i + slot / 2;
              const xIn = cx - gap / 2 - bw;
              const xOut = cx + gap / 2;
              const yIn = y(m.in / 100);
              const yOut = y(m.out / 100);
              return (
                <g key={m.key}>
                  {m.in > 0 && (
                    <>
                      <rect x={xIn} y={yIn} width={bw} height={base - yIn} rx={4} fill="#92C17D" />
                      <text x={xIn + bw / 2} y={yIn - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={LABEL_TEXT}>
                        {milInt(m.in)}
                      </text>
                    </>
                  )}
                  {m.out > 0 && (
                    <>
                      <rect x={xOut} y={yOut} width={bw} height={base - yOut} rx={4} fill="#E2C089" />
                      <text x={xOut + bw / 2} y={yOut - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#8A6312">
                        {milInt(m.out)}
                      </text>
                    </>
                  )}
                  <text
                    x={cx}
                    y={190}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={m.partial ? 700 : 500}
                    fill={m.partial ? STRONG_TEXT : MONTH_TEXT}
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}

type TicketPoint = Pick<MonthPoint, "key" | "label" | "partial" | "avgTicket" | "activeCustomers">;

/** Ticket médio line (left axis, R$) over clientes ativos bars (right axis). */
export function TicketChart({ months }: { months: TicketPoint[] }) {
  return (
    <ChartFrame height={210} label="Ticket médio e clientes ativos">
      {(W) => {
        const left = 62;
        const right = 50;
        const top = 16;
        const base = 170;
        const plotW = W - left - right;
        const slot = plotW / Math.max(1, months.length);
        const bw = Math.min(44, slot * 0.58);
        const tickets = months.map((m) => m.avgTicket / 100).filter((v) => v > 0);
        const lo = tickets.length ? Math.max(0, Math.floor(Math.min(...tickets) / 5) * 5 - 5) : 0;
        // lo stays a multiple of 5, so ticks land on round values.
        const hiRaw = tickets.length ? Math.ceil(Math.max(...tickets) / 5) * 5 : 20;
        const rawStep = Math.max(1, (hiRaw - lo) / 4);
        const step = [1, 2, 5, 10, 20, 25, 50, 100].find((n) => n >= rawStep) ?? Math.ceil(rawStep);
        const hi = lo + step * 4;
        const yT = (v: number) => base - ((v - lo) / (hi - lo)) * (base - top);
        const custMax = countAxisMax(Math.max(0, ...months.map((m) => m.activeCustomers)), 2);
        const yC = (v: number) => base - (v / custMax) * (base - top);
        const points = months
          .map((m, i) => ({ m, x: left + slot * i + slot / 2 }))
          .filter(({ m }) => m.avgTicket > 0)
          .map(({ m, x }) => ({ x, y: yT(m.avgTicket / 100), key: m.key }));
        const mid = (top + base) / 2;
        return (
          <>
            {[0, 1, 2, 3, 4].map((i) => {
              const v = lo + step * i;
              return (
                <g key={i}>
                  <line x1={left} x2={W - right} y1={yT(v)} y2={yT(v)} stroke="#F0F4ED" />
                  <text x={left - 6} y={yT(v) + 3.5} textAnchor="end" fontSize={10.5} fill={AXIS_TEXT}>
                    R$ {v}
                  </text>
                </g>
              );
            })}
            {[0, 1, 2].map((i) => {
              const v = (custMax / 2) * i;
              return (
                <text key={i} x={W - right + 8} y={yC(v) + 3.5} fontSize={10.5} fontWeight={500} fill={AXIS_TEXT}>
                  {Math.round(v)}
                </text>
              );
            })}
            {months.map((m, i) => {
              const cx = left + slot * i + slot / 2;
              const yy = yC(m.activeCustomers);
              return (
                <g key={m.key}>
                  {m.activeCustomers > 0 && (
                    <rect x={cx - bw / 2} y={yy} width={bw} height={base - yy} rx={4} fill="#CDE3C2" />
                  )}
                  <text
                    x={cx}
                    y={190}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={m.partial ? 700 : 500}
                    fill={m.partial ? STRONG_TEXT : MONTH_TEXT}
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
            {points.length > 1 && (
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#186B41"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {points.map((p) => (
              <circle key={p.key} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#186B41" strokeWidth={2.5} />
            ))}
            <text
              x={12}
              y={mid}
              textAnchor="middle"
              transform={`rotate(-90 12 ${mid})`}
              fontSize={10.5}
              fontWeight={700}
              fill="#186B41"
            >
              Ticket médio (R$)
            </text>
            <text
              x={W - 10}
              y={mid}
              textAnchor="middle"
              transform={`rotate(90 ${W - 10} ${mid})`}
              fontSize={10.5}
              fontWeight={700}
              fill="#5E8A4C"
            >
              Clientes ativos (nº)
            </text>
          </>
        );
      }}
    </ChartFrame>
  );
}
