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

/** Pill on the estoque card: "Em dia", "Abaixo do mínimo", "Esgotado". Tailwind classes. */
export const STATUS_PILL: Record<StockStatus, { label: string; bg: string; fg: string; border: string }> = {
  ok: { label: "Em dia", bg: "bg-[#e7f4ec]", fg: "text-[#2e7d4a]", border: "border-border" },
  repor: { label: "Abaixo do mínimo", bg: "bg-amber-wash", fg: "text-[#8a5a0f]", border: "border-[#f0ddb4]" },
  esgotado: { label: "Esgotado", bg: "bg-danger-wash", fg: "text-[#b23a22]", border: "border-[#f2cfc4]" },
  arquivado: { label: "Arquivado", bg: "bg-wash", fg: "text-ink-faint", border: "border-border" },
};

/** "Precisa de atenção" in the status chips = below the minimum or out. */
export function needsAttention(status: StockStatus): boolean {
  return status === "repor" || status === "esgotado";
}

/** One slot of the Loja's package bar. */
export interface Seg {
  /** sealed = a closed package · uso = the open one, hatched (no level known) · open = partial · missing = slot below the minimum */
  kind: "sealed" | "uso" | "open" | "missing";
  /** open only: how full the open package still is, 0-100. */
  pct?: number;
}

export interface StockCardView {
  status: StockStatus;
  /** Whether the item has packages at all (untracked items have no Depósito row). */
  tracked: boolean;
  lojaMain: string;
  /** color class for the Loja number */
  lojaColor: string;
  segs: Seg[];
  depMain: string;
  /** "24 un" next to the Depósito count when packages hold several countable units. */
  depHint: string;
  depEmpty: boolean;
  /** The open balance of a per-unit item can be corrected by hand (Ajustar embalagem aberta). */
  canAdjust: boolean;
}

const MAX_SEGS = 8;

/** Everything the estoque card needs to render, mirroring the design's list cards. */
export function buildStockCard(item: StockItem, units: StockUnitDef[] = DEFAULT_STOCK_UNITS): StockCardView {
  const status = stockStatus(item);
  const frac = isFrac(item);
  const pkgSize = item.pkgSize ?? 1;
  const exact = isCountUnit(item.unit, units) && !item.continuousUse;
  const hasOpen = item.continuousUse ? item.openPkg : item.tracked && frac && item.open > 0;

  const lojaColor = item.archived
    ? "text-ink-faint"
    : status === "esgotado"
      ? "text-destructive"
      : status === "repor"
        ? "text-amber"
        : "text-ink";

  let lojaMain: string;
  if (!item.tracked) {
    lojaMain = formatQty(item.qty, unitLabel(item.unit, item.qty !== 1, units));
  } else {
    const parts: string[] = [];
    if (item.sealed > 0) parts.push(`${item.sealed} ${pkgCount(item, item.sealed)}`);
    if (hasOpen) {
      parts.push(item.continuousUse ? "1 em uso" : formatQty(item.open, unitLabel(item.unit, item.open !== 1, units)));
    }
    lojaMain = parts.length > 0 ? parts.join(" + ") : `0 ${pkgCount(item, 0)}`;
  }

  const segs: Seg[] = [];
  if (item.tracked) {
    for (let i = 0; i < Math.min(item.sealed, MAX_SEGS); i++) segs.push({ kind: "sealed" });
    if (hasOpen) {
      if (item.continuousUse) segs.push({ kind: "uso" });
      else segs.push({ kind: "open", pct: Math.max(5, Math.min(100, Math.round((item.open / pkgSize) * 100))) });
    }
    // Slots still missing up to the minimum, drawn first so a shortage reads from the left.
    const min = Math.min(MAX_SEGS, Math.max(1, Math.ceil(item.reorderAt)));
    while (segs.length < min) segs.unshift({ kind: "missing" });
  }

  const dep = item.depSealed;
  return {
    status,
    tracked: item.tracked,
    lojaMain,
    lojaColor,
    segs,
    depMain: dep > 0 ? `${dep} ${pkgCount(item, dep)}` : "vazio",
    depHint:
      dep > 0 && exact && pkgSize > 1
        ? formatQty(dep * pkgSize, unitLabel(item.unit, dep * pkgSize !== 1, units))
        : "",
    depEmpty: dep === 0,
    canAdjust: frac && exact && hasOpen,
  };
}

/**
 * How many packages to move from the Depósito so the Loja ends above its
 * minimum (at least 1, never more than the Depósito holds). Used to pre-fill
 * the "Transferir para a loja" suggestions.
 */
export function suggestTransferQty(item: StockItem): number {
  const have = usableAmount(item);
  const min = threshold(item);
  // contínuo counts whole packages; the rest count base units, one package adds pkgSize of them.
  const perPkg = item.continuousUse || !item.tracked ? 1 : item.pkgSize || 1;
  const need = Math.max(1, Math.ceil((min + 1 - have) / perPkg));
  return Math.min(need, Math.max(item.depSealed, 1));
}

/**
 * The Loja's minimum as people read it: whole packages for contínuo items
 * ("2 potes"), base units for the rest ("10 un").
 */
export function minimumLabel(item: StockItem, unitLabelFn: (unit: string, plural: boolean) => string): string {
  if (item.continuousUse) return `${item.reorderAt} ${pkgCount(item, item.reorderAt)}`;
  const min = threshold(item);
  return formatQty(min, unitLabelFn(item.unit, min !== 1));
}
