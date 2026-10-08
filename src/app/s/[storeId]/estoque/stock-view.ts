import { Archive, CircleCheck, CircleX, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { DEFAULT_STOCK_UNITS, unitKind, unitLabelFrom, type StockUnitDef } from "@/lib/stock-settings";

/** Count-like units render the open package as discrete pips (not a fill bar). */
export function isCountUnit(unit: string, units: StockUnitDef[] = DEFAULT_STOCK_UNITS): boolean {
  return unitKind(units, unit) === "count";
}

/**
 * Display form of a unit id through the store's units (default units when
 * omitted): "sache" → "sachê"/"sachês". Components use `useUnits()`.
 */
export function unitLabel(unit: string, plural = false, units: StockUnitDef[] = DEFAULT_STOCK_UNITS): string {
  return unitLabelFrom(units, unit, plural);
}

/** Plural of an embalagem label: the manual plural when set, else append "s". */
export function pkgPlural(label: string, custom?: string): string {
  const c = custom?.trim();
  if (c) return c;
  return label.endsWith("s") ? label : `${label}s`;
}

/** Label for a package count: singular for exactly 1, plural otherwise. */
export function pkgCount(item: Pick<StockItem, "pkgLabel" | "pkgLabelPlural">, n: number): string {
  const label = item.pkgLabel ?? "emb.";
  return n === 1 ? label : pkgPlural(label, item.pkgLabelPlural);
}

/**
 * "Fractional" items are consumed from an open package (grams from a pote, a
 * sachê from a caixa). Whole-unit items (Morango, CR7 garrafa · pkgSize 1)
 * count sealed units directly and never fraction.
 */
export function isFrac(item: StockItem): boolean {
  if (!item.tracked) return false;
  return item.unit !== "un" || (item.pkgSize ?? 1) > 1;
}

/**
 * Stock measured in the design's package terms: contínuo items count whole
 * packages (sealed + the open one); everything else counts base-unit qty.
 */
export function usableAmount(item: StockItem): number {
  if (item.continuousUse) return item.sealed + (item.openPkg ? 1 : 0);
  return item.qty;
}

/** Low-stock threshold in the same terms as {@link usableAmount}. */
export function threshold(item: StockItem): number {
  return item.tracked && !item.continuousUse
    ? item.reorderAt * (item.pkgSize || 1)
    : item.reorderAt;
}

export type StockStatus = "ok" | "repor" | "esgotado" | "arquivado";

export function stockStatus(item: StockItem): StockStatus {
  if (item.archived) return "arquivado";
  const usable = usableAmount(item);
  if (usable === 0) return "esgotado";
  if (usable <= threshold(item)) return "repor";
  return "ok";
}

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  fg: string;
  bg: string;
}

export const STATUS_META: Record<StockStatus, StatusMeta> = {
  ok: { label: "OK", icon: CircleCheck, fg: "text-success", bg: "bg-mint-wash" },
  repor: { label: "Repor", icon: RotateCw, fg: "text-amber", bg: "bg-amber-wash" },
  esgotado: { label: "Esgotado", icon: CircleX, fg: "text-destructive", bg: "bg-danger-wash" },
  arquivado: { label: "Arquivado", icon: Archive, fg: "text-ink-faint", bg: "bg-wash" },
};

export interface StockCardView {
  status: StockStatus;
  low: boolean;
  leftLabel: string;
  leftMain: string;
  leftSub: string;
  /** color class for the primary number */
  leftColor: string;
  hasOpen: boolean;
  openMain: string;
  openSub: string;
  /** count-unit open package → pips (filled count + total) */
  pips: { total: number; filled: number } | null;
  /** big count-unit open package → fill bar percentage 0-100 */
  barPct: number | null;
  /** Right-column message when there's nothing open: "Nenhuma embalagem
   *  aberta" (frac-capable, just not started) or "Não fraciona" (whole-unit
   *  items that never open a package). */
  openMutedLabel: string;
  /** Consumed per unit out of a multi-unit package (copos, sachês): shows "consumo por unidade". */
  perUnit: boolean;
  /** The open balance of a per-unit item can be corrected by hand (Ajustar saldo). */
  canAdjust: boolean;
}

/** Integer-friendly number in pt-BR ("2", "1,5"). */
function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Everything the estoque card needs to render, mirroring the design's stockRows. */
export function buildStockCard(item: StockItem, units: StockUnitDef[] = DEFAULT_STOCK_UNITS): StockCardView {
  const status = stockStatus(item);
  const low = status === "repor" || status === "esgotado";
  const pu = unitLabel(item.unit, false, units);
  const frac = isFrac(item);
  const pkgSize = item.pkgSize ?? 1;
  const pkgLabel = item.pkgLabel ?? "emb.";

  const exact = isCountUnit(item.unit, units) && !item.continuousUse;
  const hasOpen = item.continuousUse ? item.openPkg : item.tracked && frac && item.open > 0;

  const leftColor = item.archived
    ? "text-ink-faint"
    : low
      ? status === "esgotado"
        ? "text-destructive"
        : "text-amber"
      : "text-ink";

  let openMain = "";
  let openSub = "";
  if (hasOpen) {
    if (item.continuousUse) {
      openMain = `Em uso · ${item.usos} ${item.usos === 1 ? "uso" : "usos"}`;
      openSub = `embalagem de ${formatQty(pkgSize, pu)}`;
    } else if (exact) {
      const used = Math.max(0, pkgSize - item.open);
      const label = (n: number) => unitLabel(item.unit, n !== 1, units);
      openMain = `${item.open === 1 ? "Resta" : "Restam"} ${fmtNum(item.open)} de ${formatQty(pkgSize, label(pkgSize))}`;
      openSub = `${formatQty(used, label(used))} já ${used === 1 ? "usada" : "usadas"}`;
    } else {
      openMain = "Em uso";
      openSub = `embalagem de ${formatQty(pkgSize, pu)}`;
    }
  }

  const pips =
    hasOpen && exact && pkgSize <= 12
      ? { total: pkgSize, filled: Math.round(item.open) }
      : null;
  const barPct =
    hasOpen && exact && pkgSize > 12
      ? Math.max(5, Math.round((item.open / pkgSize) * 100))
      : null;

  return {
    status,
    low,
    leftLabel: item.tracked ? "Fechados" : "Em estoque",
    leftMain: item.tracked
      ? `${item.sealed} ${pkgCount(item, item.sealed)}`
      : `${formatQty(item.qty, pu)}`,
    leftSub: item.tracked
      ? frac
        ? `${formatQty(pkgSize, pu)}/${pkgLabel}`
        : item.sealed === 0
          ? `mínimo ${formatQty(item.reorderAt, unitLabel(item.unit, false, units))}.`
          : `vendido por ${pkgLabel}`
      : "não rastreado",
    leftColor,
    hasOpen,
    openMain,
    openSub,
    pips,
    barPct,
    openMutedLabel: frac ? "Nenhuma embalagem aberta" : "Não fraciona",
    perUnit: frac && exact,
    canAdjust: frac && exact && hasOpen,
  };
}
