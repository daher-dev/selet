"use client";

import type { MonthPoint } from "@/lib/dashboard-core";
import {
  AXIS_TEXT,
  ChartFrame,
  CURRENT_BG,
  GRID,
  Hatch,
  LABEL_TEXT,
  MONTH_TEXT,
  NEGATIVE,
  POSITIVE,
  STRONG_TEXT,
  kLabel,
  milLabel,
  niceMax,
  pctLabel,
} from "./chart-kit";

type SalesPoint = Pick<MonthPoint, "key" | "label" | "sales" | "mom" | "partial">;

/**
 * 12-month faturamento bars (R$ mil) with a MoM row under the months. The
 * current month is darker, sits on a tinted column and is hatched ("parcial").
 */
export function MonthlySalesChart({ months }: { months: SalesPoint[] }) {
  return (
    <ChartFrame height={252} fallback={1016} label="Vendas mensais">
      {(W) => {
        const left = 40;
        const top = 20;
        const base = 200;
        const n = Math.max(1, months.length);
        const slot = (W - left) / n;
        const bw = Math.min(46, slot * 0.56);
        const compact = slot < 34;
        const maxReais = Math.max(0, ...months.map((m) => m.sales / 100));
        const axisMax = niceMax(maxReais, 4);
        const y = (reais: number) => base - (reais / axisMax) * (base - top);
        const ticks = [0, 1, 2, 3, 4].map((i) => (axisMax / 4) * i);
        return (
          <>
            <Hatch id="hatch-sales" />
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} />
                <text
                  x={left - 8}
                  y={y(t) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={500}
                  fill={AXIS_TEXT}
                >
                  {kLabel(t)}
                </text>
              </g>
            ))}
            {!compact && (
              <text x={0} y={244} fontSize={10.5} fontWeight={700} fill={AXIS_TEXT}>
                MoM
              </text>
            )}
            {months.map((m, i) => {
              const cx = left + slot * i + slot / 2;
              const barTop = y(m.sales / 100);
              const h = Math.max(0, base - barTop);
              const col = { x: cx - slot * 0.45, w: slot * 0.9 };
              return (
                <g key={m.key}>
                  {m.partial && (
                    <rect x={col.x} y={8} width={col.w} height={240} rx={10} fill={CURRENT_BG} />
                  )}
                  {h > 0 && (
                    <rect
                      x={cx - bw / 2}
                      y={barTop}
                      width={bw}
                      height={h}
                      rx={Math.min(6, bw / 4)}
                      fill={m.partial ? "#186B41" : "#92C17D"}
                    />
                  )}
                  {m.partial && (
                    <rect
                      x={col.x}
                      y={8}
                      width={col.w}
                      height={base - 8}
                      rx={6}
                      fill="url(#hatch-sales)"
                      stroke="#186B41"
                      strokeOpacity={0.35}
                      strokeDasharray="3 3"
                    />
                  )}
                  {m.sales > 0 && (!compact || m.partial) && (
                    <text
                      x={cx}
                      y={barTop - 7}
                      textAnchor="middle"
                      fontSize={compact ? 10 : 11.5}
                      fontWeight={m.partial ? 700 : 600}
                      fill={m.partial ? STRONG_TEXT : LABEL_TEXT}
                    >
                      {milLabel(m.sales)}
                    </text>
                  )}
                  <text
                    x={cx}
                    y={220}
                    textAnchor="middle"
                    fontSize={compact ? 10.5 : 12}
                    fontWeight={m.partial ? 700 : 500}
                    fill={m.partial ? STRONG_TEXT : MONTH_TEXT}
                  >
                    {m.label}
                  </text>
                  {m.partial ? (
                    <text
                      x={Math.min(cx, W - 1 - (compact ? 16 : 20))}
                      y={244}
                      textAnchor="middle"
                      fontSize={compact ? 9.5 : 11}
                      fontWeight={700}
                      fill={POSITIVE}
                    >
                      parcial
                    </text>
                  ) : (
                    !compact &&
                    m.mom !== null && (
                      <text
                        x={cx}
                        y={244}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={m.mom < 0 ? NEGATIVE : POSITIVE}
                      >
                        {pctLabel(m.mom)}
                      </text>
                    )
                  )}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}

export const CHANNEL_SERIES = [
  { key: "instagram", label: "Instagram", color: "#C2407E" },
  { key: "whatsapp", label: "WhatsApp", color: "#1E9E54" },
  { key: "loja", label: "Loja física", color: "#9DB394" },
] as const;

/** Shared frame for the two small 12-month stacked charts. */
function smallFrame(W: number, n: number) {
  const left = 32;
  const slot = (W - left - 2) / Math.max(1, n);
  return {
    left,
    slot,
    bw: Math.min(24, slot * 0.64),
    top: 40,
    base: 190,
    cx: (i: number) => left + slot * i + slot / 2,
  };
}

function CurrentColumn({
  cx,
  slot,
  hatchId,
  base,
}: {
  cx: number;
  slot: number;
  hatchId: string;
  base: number;
}) {
  const w = Math.min(slot * 0.95, 36);
  return (
    <rect
      x={cx - w / 2}
      y={30}
      width={w}
      height={base - 30}
      rx={6}
      fill={`url(#${hatchId})`}
      stroke="#186B41"
      strokeOpacity={0.35}
      strokeDasharray="3 3"
    />
  );
}

function CurrentBg({ cx, slot }: { cx: number; slot: number }) {
  const w = Math.min(slot * 0.95, 36);
  return <rect x={cx - w / 2} y={30} width={w} height={188} rx={6} fill={CURRENT_BG} />;
}

function MonthLabel({ x, m, compact }: { x: number; m: { label: string; partial: boolean }; compact: boolean }) {
  return (
    <text
      x={x}
      y={209}
      textAnchor="middle"
      fontSize={compact ? 9.5 : 11}
      fontWeight={m.partial ? 700 : 500}
      fill={m.partial ? STRONG_TEXT : MONTH_TEXT}
    >
      {m.label}
    </text>
  );
}

type ChannelPoint = Pick<MonthPoint, "key" | "label" | "partial" | "channels">;

/** 100% stacked bars of orders per channel (Loja bottom → Instagram top). */
export function ChannelStackChart({ months }: { months: ChannelPoint[] }) {
  return (
    <ChartFrame height={218} label="Canais de venda por mês">
      {(W) => {
        const f = smallFrame(W, months.length);
        const compact = f.slot < 30;
        const h = f.base - f.top;
        const order = ["loja", "whatsapp", "instagram"] as const;
        const color = Object.fromEntries(CHANNEL_SERIES.map((c) => [c.key, c.color]));
        return (
          <>
            <Hatch id="hatch-channels" />
            {[0, 50, 100].map((t) => {
              const yy = f.base - (t / 100) * h;
              return (
                <g key={t}>
                  <line x1={f.left} x2={W} y1={yy} y2={yy} stroke={GRID} />
                  <text x={f.left - 6} y={yy + 4} textAnchor="end" fontSize={10.5} fontWeight={500} fill={AXIS_TEXT}>
                    {t}%
                  </text>
                </g>
              );
            })}
            {months.map((m, i) => {
              const cx = f.cx(i);
              const total = m.channels.instagram + m.channels.whatsapp + m.channels.loja;
              let cursor = f.base - 1;
              return (
                <g key={m.key}>
                  {m.partial && <CurrentBg cx={cx} slot={f.slot} />}
                  {total > 0 &&
                    order.map((k) => {
                      const v = m.channels[k];
                      if (v <= 0) return null;
                      const segH = (v / total) * (h - 1);
                      cursor -= segH;
                      return (
                        <rect
                          key={k}
                          x={cx - f.bw / 2}
                          y={cursor}
                          width={f.bw}
                          height={Math.max(0, segH - 1)}
                          rx={2}
                          fill={color[k]}
                        />
                      );
                    })}
                  <MonthLabel x={cx} m={m} compact={compact} />
                  {m.partial && (
                    <CurrentColumn cx={cx} slot={f.slot} hatchId="hatch-channels" base={f.base} />
                  )}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}

type CustomerPoint = Pick<MonthPoint, "key" | "label" | "partial" | "novos" | "recorrentes">;

/** Stacked recorrentes (bottom) + novos (top) per month, total on top. */
export function CustomerSplitChart({ months }: { months: CustomerPoint[] }) {
  return (
    <ChartFrame height={218} label="Clientes ativos por mês">
      {(W) => {
        const f = smallFrame(W, months.length);
        const compact = f.slot < 30;
        const maxTotal = Math.max(0, ...months.map((m) => m.novos + m.recorrentes));
        const axisMax = niceMax(maxTotal, 3);
        const h = f.base - f.top;
        const y = (v: number) => f.base - 1 - (v / axisMax) * (h - 1);
        return (
          <>
            <Hatch id="hatch-customers" />
            {[0, 1, 2, 3].map((i) => {
              const t = (axisMax / 3) * i;
              const yy = f.base - (i / 3) * h;
              return (
                <g key={i}>
                  <line x1={f.left} x2={W} y1={yy} y2={yy} stroke={GRID} />
                  <text x={f.left - 6} y={yy + 4} textAnchor="end" fontSize={10.5} fontWeight={500} fill={AXIS_TEXT}>
                    {Math.round(t)}
                  </text>
                </g>
              );
            })}
            {months.map((m, i) => {
              const cx = f.cx(i);
              const total = m.novos + m.recorrentes;
              const recTop = y(m.recorrentes);
              const totTop = y(total);
              return (
                <g key={m.key}>
                  {m.partial && <CurrentBg cx={cx} slot={f.slot} />}
                  {m.recorrentes > 0 && (
                    <rect
                      x={cx - f.bw / 2}
                      y={recTop}
                      width={f.bw}
                      height={f.base - 1 - recTop}
                      rx={2}
                      fill="#186B41"
                      opacity={m.partial ? 1 : 0.8}
                    />
                  )}
                  {m.novos > 0 && (
                    <rect
                      x={cx - f.bw / 2}
                      y={totTop}
                      width={f.bw}
                      height={Math.max(0, recTop - totTop - 1)}
                      rx={2}
                      fill="#2F6FB5"
                    />
                  )}
                  <MonthLabel x={cx} m={m} compact={compact} />
                  {m.partial && (
                    <CurrentColumn cx={cx} slot={f.slot} hatchId="hatch-customers" base={f.base} />
                  )}
                  {total > 0 && (!compact || m.partial) && (
                    <text
                      x={cx}
                      y={totTop - 6}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={m.partial ? 700 : 600}
                      fill={m.partial ? STRONG_TEXT : LABEL_TEXT}
                    >
                      {total}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
