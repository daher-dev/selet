import { CircleCheck, CircleX, TriangleAlert, Archive } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";

/** Count-like units render the open package as discrete pips (not a fill bar). */
export function isCountUnit(unit: string): boolean {
  return unit === "un" || unit === "sache";
}

/** Display form of a unit: internal "sache" → "sachê"/"sachês". */
export function unitLabel(unit: string, plural = false): string {
  if (unit === "sache") return plural ? "sachês" : "sachê";
  return unit;
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
  repor: { label: "Repor", icon: TriangleAlert, fg: "text-amber", bg: "bg-amber-wash" },
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
}

/** Everything the estoque card needs to render, mirroring the design's stockRows. */
export function buildStockCard(item: StockItem): StockCardView {
  const status = stockStatus(item);
  const low = status === "repor" || status === "esgotado";
  const pu = unitLabel(item.unit, false);
  const puPlural = unitLabel(item.unit, true);
  const frac = isFrac(item);
  const pkgSize = item.pkgSize ?? 1;
  const pkgLabel = item.pkgLabel ?? "emb.";

  const exact = isCountUnit(item.unit) && !item.continuousUse;
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
      openMain = `${item.open}/${pkgSize}`;
      openSub = `${puPlural} disponíveis`;
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
      ? `${item.sealed} ${item.sealed === 1 ? pkgLabel : pkgLabel + "s"}`
      : `${formatQty(item.qty, pu)}`,
    leftSub: item.tracked
      ? frac
        ? `${formatQty(pkgSize, pu)}/${pkgLabel}`
        : ""
      : "não rastreado",
    leftColor,
    hasOpen,
    openMain,
    openSub,
    pips,
    barPct,
  };
}
