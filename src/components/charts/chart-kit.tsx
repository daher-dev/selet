"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny SVG chart toolkit for the hand-drawn Claude Design charts (Visão geral
 * + Financeiro). Charts render in real pixel space — measured from the
 * container — instead of a scaled viewBox, so text stays legible at phone
 * width and bars reflow instead of shrinking.
 *
 * Interactivity: `ChartFrame` owns the hover state and the tooltip;
 * `HoverColumns` (rendered last inside the frame, so it sits on top) turns one
 * slot per month into a hover / tap / keyboard target; `useSeriesVisibility`
 * + the clickable `Legend` hide and show series.
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

/** One row of a chart tooltip: swatch + label on the left, value on the right. */
export interface TooltipRow {
  label: string;
  value: string;
  /** swatch color; omit for a plain row */
  color?: string;
  /** draw the swatch as a thin line (line series) */
  line?: boolean;
  /** tint the value (deltas / saldo) */
  tone?: "positive" | "negative";
}

/** What a chart shows for one hovered month. */
export interface TooltipModel {
  title: string;
  /** small chip next to the title ("parcial") */
  badge?: string;
  rows: TooltipRow[];
  /** summary row under a divider (Total, Saldo) */
  footer?: TooltipRow;
}

/** Plain-text version of a tooltip, used as the column's accessible name. */
export function describeTooltip(m: TooltipModel): string {
  const parts = [...m.rows, ...(m.footer ? [m.footer] : [])].map((r) => `${r.label} ${r.value}`);
  return `${m.title}${m.badge ? ` (${m.badge})` : ""}: ${parts.join(", ")}`;
}

/**
 * Left edge for a tooltip anchored at `anchorX`: right of the anchor, flipped
 * to its left when it would overflow, and finally clamped inside the frame.
 */
export function tooltipLeft(anchorX: number, tipW: number, frameW: number, gap = 12): number {
  let left = anchorX + gap;
  if (left + tipW > frameW) left = anchorX - gap - tipW;
  return Math.max(0, Math.min(left, frameW - tipW));
}

/** "2026-07" → "Julho de 2026". */
export function monthTitle(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const text = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Opacity for a month's group while another month is hovered. */
export function dimOpacity(hover: number | null, index: number): number {
  return hover === null || hover === index ? 1 : 0.55;
}

interface HoverState {
  index: number;
  /** x of the hovered column's center, in svg pixels */
  x: number;
}

interface HoverContextValue {
  active: number | null;
  show: (index: number, x: number) => void;
  hide: () => void;
  describe: (index: number) => string;
}

const HoverContext = createContext<HoverContextValue | null>(null);

/** Measures the rendered width of a block element (SSR renders `fallback`). */
export function ChartFrame({
  height,
  fallback = 480,
  label,
  tooltip,
  children,
}: {
  height: number;
  fallback?: number;
  /** accessible name for the chart */
  label: string;
  /** tooltip content for a hovered month (index into the chart's months) */
  tooltip?: (index: number) => TooltipModel;
  children: (width: number, hover: number | null) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  const [hover, setHover] = useState<HoverState | null>(null);
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

  // Touch has no reliable "leave": a tap anywhere outside dismisses the tooltip.
  const open = hover !== null;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const show = useCallback((index: number, x: number) => {
    setHover((prev) => (prev && prev.index === index && prev.x === x ? prev : { index, x }));
  }, []);
  const hide = useCallback(() => setHover(null), []);
  const describe = useCallback(
    (index: number) => (tooltip ? describeTooltip(tooltip(index)) : ""),
    [tooltip],
  );

  return (
    <HoverContext.Provider value={{ active: hover?.index ?? null, show, hide, describe }}>
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={label}
          className="block"
          fontFamily={FONT}
        >
          {children(width, hover?.index ?? null)}
        </svg>
        {hover && tooltip && (
          <TooltipBox x={hover.x} frameWidth={width}>
            <ChartTooltip {...tooltip(hover.index)} />
          </TooltipBox>
        )}
      </div>
    </HoverContext.Provider>
  );
}

/** Positions the tooltip next to the hovered column, inside the frame. */
function TooltipBox({
  x,
  frameWidth,
  children,
}: {
  x: number;
  frameWidth: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured after layout (before paint) so the flip / clamp never flickers.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.style.left = `${tooltipLeft(x, el.offsetWidth, frameWidth)}px`;
  });
  return (
    <div ref={ref} className="pointer-events-none absolute top-1 z-10" style={{ left: 0 }}>
      {children}
    </div>
  );
}

/** The floating card: month title, one row per visible series, optional footer. */
export function ChartTooltip({ title, badge, rows, footer }: TooltipModel) {
  return (
    <div
      role="tooltip"
      className="min-w-[156px] rounded-xl border border-border bg-card px-3 py-2.5 text-[12px] shadow-[0_10px_28px_-12px_rgba(21,35,28,0.35)]"
    >
      <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-bold text-ink">
        {title}
        {badge && (
          <span className="rounded-full bg-[#E2F0DA] px-1.5 py-px text-[10.5px] font-bold text-primary">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <TooltipLine key={r.label} row={r} />
        ))}
      </div>
      {footer && (
        <div className="mt-1.5 border-t border-wash pt-1.5">
          <TooltipLine row={footer} strong />
        </div>
      )}
    </div>
  );
}

function TooltipLine({ row, strong = false }: { row: TooltipRow; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {row.color && (
        <span
          aria-hidden
          className={row.line ? "h-[3px] w-3 rounded-sm" : "size-2.5 rounded-[3px]"}
          style={{ background: row.color }}
        />
      )}
      <span className={cn("text-ink-soft", strong && "font-semibold text-ink")}>{row.label}</span>
      <span
        className={cn(
          "tabular ml-auto pl-3 font-bold text-ink",
          row.tone === "positive" && "text-[#2D8350]",
          row.tone === "negative" && "text-[#C0492F]",
        )}
      >
        {row.value}
      </span>
    </div>
  );
}

/**
 * One transparent hit target per month, drawn on top of the plot. Mouse hover,
 * tap and keyboard focus all drive the frame's tooltip. Arrow keys / Home / End
 * move between months (one Tab stop per chart), Escape dismisses.
 */
export function HoverColumns({
  n,
  x0,
  slot,
  top,
  bottom,
}: {
  n: number;
  /** x of the first slot's left edge */
  x0: number;
  slot: number;
  top: number;
  bottom: number;
}) {
  const ctx = useContext(HoverContext);
  const groupRef = useRef<SVGGElement>(null);
  const [tabStop, setTabStop] = useState(0);
  if (!ctx || n <= 0) return null;

  const focusColumn = (i: number) => {
    const cols = groupRef.current?.querySelectorAll<SVGRectElement>("[data-hover-col]");
    cols?.[Math.max(0, Math.min(n - 1, i))]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<SVGRectElement>, i: number) => {
    const next =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next !== null) {
      e.preventDefault();
      focusColumn(next);
    } else if (e.key === "Escape") {
      ctx.hide();
    }
  };

  return (
    <g ref={groupRef}>
      {Array.from({ length: n }, (_, i) => {
        const cx = x0 + slot * i + slot / 2;
        return (
          <rect
            key={i}
            data-hover-col=""
            x={x0 + slot * i}
            y={top}
            width={slot}
            height={Math.max(0, bottom - top)}
            rx={6}
            fill={ctx.active === i ? "#186B41" : "transparent"}
            fillOpacity={ctx.active === i ? 0.07 : 1}
            pointerEvents="all"
            tabIndex={i === tabStop ? 0 : -1}
            role="img"
            aria-label={ctx.describe(i)}
            style={{ outline: "none", cursor: "default" }}
            onPointerEnter={() => ctx.show(i, cx)}
            onPointerDown={() => ctx.show(i, cx)}
            // A finger lifting fires pointerleave right after the tap — keep the tooltip.
            onPointerLeave={(e) => e.pointerType !== "touch" && ctx.hide()}
            onFocus={() => {
              setTabStop(i);
              ctx.show(i, cx);
            }}
            onBlur={ctx.hide}
            onKeyDown={(e) => onKeyDown(e, i)}
          />
        );
      })}
    </g>
  );
}

/** Which series keys are hidden, given a toggle request. Never hides the last visible one. */
export function toggleSeries<K extends string>(
  hidden: ReadonlySet<K>,
  key: K,
  all: readonly K[],
): ReadonlySet<K> {
  const next = new Set(hidden);
  if (next.delete(key)) return next;
  if (all.filter((k) => !hidden.has(k)).length <= 1) return hidden;
  next.add(key);
  return next;
}

/** Show/hide state for a chart's series; pairs with the clickable `Legend`. */
export function useSeriesVisibility<K extends string>(keys: readonly K[]) {
  const [hidden, setHidden] = useState<ReadonlySet<K>>(() => new Set());
  const toggle = useCallback(
    (key: K) => setHidden((prev) => toggleSeries(prev, key, keys)),
    [keys],
  );
  return { hidden, isVisible: (key: K) => !hidden.has(key), toggle };
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

/** Legend chip row shown above/below a chart; chips toggle their series when `onToggle` is given. */
export function Legend({
  items,
  trailing,
  onToggle,
}: {
  items: { key?: string; label: string; color: string; line?: boolean; hidden?: boolean }[];
  trailing?: string;
  onToggle?: (key: string) => void;
}) {
  const visibleCount = items.filter((it) => !it.hidden).length;
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      {items.map((it) => {
        const key = it.key ?? it.label;
        const swatch = (
          <span
            aria-hidden
            className={it.line ? "h-[3px] w-4 rounded-sm" : "size-2.5 rounded-[3px]"}
            style={
              it.hidden
                ? it.line
                  ? { background: it.color, opacity: 0.3 }
                  : { border: `1.5px solid ${it.color}` }
                : { background: it.color }
            }
          />
        );
        if (!onToggle) {
          return (
            <span key={key} className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              {swatch}
              {it.label}
            </span>
          );
        }
        // The last visible series can't be hidden — keep the chart readable.
        const locked = !it.hidden && visibleCount <= 1;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={!it.hidden}
            aria-disabled={locked || undefined}
            title={locked ? "Pelo menos uma série precisa ficar visível" : undefined}
            onClick={() => onToggle(key)}
            className={cn(
              "-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] text-ink-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              locked ? "cursor-default" : "cursor-pointer hover:bg-wash",
              it.hidden && "text-ink-faint line-through",
            )}
          >
            {swatch}
            {it.label}
          </button>
        );
      })}
      {trailing && (
        <span className="ml-auto text-[11.5px] text-[#A0AC9D]">{trailing}</span>
      )}
    </div>
  );
}
