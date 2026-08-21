/**
 * Pure cartela derivation helpers — no I/O, shared by the data layer, server
 * actions, and client components. `uses` is always the source of truth (see
 * Cartela); everything else here is computed from it.
 *
 * Punch semantics: index 0 is always the brinde (free), consumed FIRST;
 * indices 1..N are paid uses, consumed in order. Since uses are appended to
 * Cartela.uses in the order they happened, the brinde is always uses[0].
 */
import type {
  Cartela,
  CartelaManualReason,
  CartelaManualUse,
  CartelaOrderUse,
  CartelaStatus,
} from "./types";

/** Display code for a cartela doc ID, mirrors orderCode(): first 4 chars, uppercased. */
export function cartelaCode(id: string): string {
  return id.slice(0, 4).toUpperCase();
}

export function remainingUses(c: Cartela): number {
  return Math.max(0, c.totalUses - c.uses.length);
}

/** Balance still redeemable, in centavos: every remaining use is worth `unitValue`. */
export function balanceValue(c: Cartela): number {
  return remainingUses(c) * c.unitValue;
}

export type PunchState =
  | "brinde-livre"
  | "brinde-usado"
  | "livre"
  | "usado"
  | "ajuste"
  // Forecast-only states: never produced by punchStates() itself — only ever
  // built manually by the Pedidos "Cartela aplicada" confirmation step, to
  // show what a cartela will look like right after the order being edited
  // saves (see CartelaConfirmStep's forecastStates()).
  | "usado-agora" // about to be consumed by the order being saved
  | "disponivel"; // still free after this order saves

/**
 * One entry per punch slot (length === totalUses), single source of truth for
 * every dot-row render (cartelas list, customer summary card, history sheet).
 * A slot filled by a manual adjustment renders as "ajuste" regardless of
 * whether it happens to be the brinde slot — the point of that state is
 * "this punch has no product behind it", independent of position.
 */
export function punchStates(c: Cartela): PunchState[] {
  const usedCount = c.uses.length;
  return Array.from({ length: c.totalUses }, (_, i) => {
    if (i >= usedCount) return i === 0 ? "brinde-livre" : "livre";
    if (c.uses[i].kind === "manual") return "ajuste";
    return i === 0 ? "brinde-usado" : "usado";
  });
}

/**
 * Forecast dot row for the Pedidos "Cartela aplicada" confirmation step: what
 * a cartela will look like right after the order currently being edited
 * saves. Splits the used slots three ways instead of punchStates()'s binary
 * used/free — the TRUE pre-existing prefix (via punchStates, so a manual
 * "ajuste" slot keeps its own dashed-purple rendering), then the uses this
 * order is about to add ("usado-agora"), then the remainder ("disponivel").
 *
 * `consumedByThisOrder` is how many of `cartela.uses` this SAME order (being
 * edited) already holds server-side — those are about to be reversed and
 * replaced by `newUsesInDraft`, so they're excluded from the "pre-existing"
 * prefix. Both default to 0 for the create-order case (nothing to exclude).
 */
export function forecastPunchStates(
  cartela: Cartela,
  consumedByThisOrder = 0,
  newUsesInDraft = 0,
): PunchState[] {
  const priorCount = Math.max(0, cartela.uses.length - consumedByThisOrder);
  // punchStates(cartela) is already resolved per-slot (ajuste/usado/brinde-usado)
  // for every index < cartela.uses.length — slicing to priorCount can only
  // ever take resolved states, never "livre"/"brinde-livre".
  const prior = punchStates(cartela).slice(0, priorCount);
  const disponivel = Math.max(0, cartela.totalUses - prior.length - newUsesInDraft);
  return [
    ...prior,
    ...Array.from({ length: newUsesInDraft }, () => "usado-agora" as const),
    ...Array.from({ length: disponivel }, () => "disponivel" as const),
  ];
}

/**
 * Whether a single cartela use can cover an order line priced at `listPrice`.
 * Decision #1: a use is worth a FIXED value — if the line's price is LESS
 * than that value, redemption must be blocked (never allow forfeiting the
 * difference). Returns the amount covered, or null when blocked.
 */
export function coverageFor(listPrice: number, unitValue: number): number | null {
  return listPrice >= unitValue ? unitValue : null;
}

/**
 * Status transition after a punch (sell/redeem). A manual "cancelada" flag is
 * never overridden by this — cancelling is a pure status flag set directly by
 * the data layer, not derived from use counts.
 */
export function computeStatus(c: Cartela): CartelaStatus {
  if (c.status === "cancelada") return "cancelada";
  return remainingUses(c) === 0 ? "esgotada" : "ativa";
}

export interface CartelaUseWithFlag extends CartelaOrderUse {
  /** True only for the very first use ever recorded on the cartela (the brinde). */
  isBrinde: boolean;
}

export interface CartelaOrderGroup {
  orderId: string;
  orderCode: string;
  /** Latest use timestamp within the group — drives newest-first group ordering. */
  at: string;
  /** Newest-first within the group. */
  uses: CartelaUseWithFlag[];
}

/** Groups order-backed uses by the order that consumed them, newest-first, for the history drawer. Manual adjustments are excluded — see manualUseGroups(). */
export function usesByOrder(c: Cartela): CartelaOrderGroup[] {
  const groups = new Map<string, CartelaOrderGroup>();
  c.uses.forEach((u, i) => {
    if (u.kind === "manual") return;
    const flagged: CartelaUseWithFlag = { ...u, isBrinde: i === 0 };
    const existing = groups.get(u.orderId);
    if (existing) {
      existing.uses.unshift(flagged);
      if (flagged.at > existing.at) existing.at = flagged.at;
    } else {
      groups.set(u.orderId, {
        orderId: u.orderId,
        orderCode: u.orderCode,
        at: flagged.at,
        uses: [flagged],
      });
    }
  });
  return Array.from(groups.values()).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export const CARTELA_MANUAL_REASON_LABELS: Record<CartelaManualReason, string> = {
  NAO_REGISTRADO: "Uso não registrado no caixa",
  CORTESIA: "Cortesia",
  CORRECAO: "Correção de contagem",
};

export interface CartelaManualGroup extends CartelaManualUse {
  /** How many uses this single "Marcar uso manual" submission covers. */
  count: number;
  /** True when this batch includes uses[0] (the brinde). */
  isBrinde: boolean;
}

/**
 * Groups manual (order-less) uses by their shared `at` timestamp, newest
 * first, for the history drawer's own section. Every entry from a single
 * "Marcar uso manual" submission is stamped with the same `at` (mirrors how
 * planCartelas stamps every use in one order with a single nowIso), so
 * timestamp equality is a reliable batch key without a separate id field.
 */
export function manualUseGroups(c: Cartela): CartelaManualGroup[] {
  const groups = new Map<string, CartelaManualGroup>();
  c.uses.forEach((u, i) => {
    if (u.kind !== "manual") return;
    const existing = groups.get(u.at);
    if (existing) {
      existing.count += 1;
      existing.isBrinde = existing.isBrinde || i === 0;
    } else {
      groups.set(u.at, { ...u, count: 1, isBrinde: i === 0 });
    }
  });
  return Array.from(groups.values()).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
