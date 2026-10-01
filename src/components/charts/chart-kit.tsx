"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Tiny SVG chart toolkit for the hand-drawn Claude Design charts (Visão geral
 * + Financeiro). Charts render in real pixel space — measured from the
 * container — instead of a scaled viewBox, so text stays legible at phone
 * width and bars reflow instead of shrinking.
 */

export const FONT = "var(--font-albert), Albert Sans, sans-serif";
export const GRID = "#EEF2EB";
export const AXIS_TEXT = "#A0AC9D";
export const LABEL_TEXT = "#5C6B62";
export const MONTH_TEXT = "#8A968D";
export const STRONG_TEXT = "#15231C";
export const CURRENT_BG = "#F3F8EF";
export const POSITIVE = "#3A9D5D";
export const NEGATIVE = "#C0492F";

/** Measures the rendered width of a block element (SSR renders `fallback`). */
export function ChartFrame({
  height,
  fallback = 480,
  label,
  children,
}: {
  height: number;
  fallback?: number;
  /** accessible name for the chart image */
  label: string;
  children: (width: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className="block"
        fontFamily={FONT}
      >
        {children(width)}
      </svg>
    </div>
  );
}

/** Diagonal white hatch used to mark the still-open current month. */
export function Hatch({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="3" height="7" fill="#fff" fillOpacity=".7" />
      </pattern>
    </defs>
  );
}

/** Rounds `max` up to a "nice" axis top divisible into `steps` ticks. */
export function niceMax(max: number, steps = 4): number {
  if (max <= 0) return steps;
  const raw = max / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].find((n) => n * mag >= raw) ?? 10;
  return nice * mag * steps;
}

/**
 * Axis top for a COUNT axis split into `steps` ticks: like niceMax, but always
 * an integer divisible by `steps`, so every tick is a distinct whole number
 * (niceMax(1, 3) = 1.5 would label 0, 1, 1, 2).
 */
export function countAxisMax(max: number, steps: number): number {
  return Math.max(steps, Math.ceil(niceMax(max, steps) / steps) * steps);
}

/** Axis tick label: 10000 → "10k", 250 → "250". Input in reais. */
export function kLabel(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return String(Math.round(value));
}

/** Centavos → value in R$ mil with one decimal ("18,2"); "28" when round. */
export function milLabel(centavos: number): string {
  const mil = centavos / 100 / 1000;
  const rounded = Math.round(mil * 10) / 10;
  return rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** 7.7 → "+7,7%", -8.7 → "−8,7%". */
export function pctLabel(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Legend chip row shown above/below a chart. */
export function Legend({
  items,
  trailing,
}: {
  items: { label: string; color: string; line?: boolean }[];
  trailing?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      {items.map((it) => (
        <span
          key={it.label}
          className="flex items-center gap-1.5 text-[12px] text-ink-soft"
        >
          <span
            className={it.line ? "h-[3px] w-4 rounded-sm" : "size-2.5 rounded-[3px]"}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
      {trailing && (
        <span className="ml-auto text-[11.5px] text-[#A0AC9D]">{trailing}</span>
      )}
    </div>
  );
}
