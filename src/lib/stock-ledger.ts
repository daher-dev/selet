import type { StockMovement } from "@/lib/types";
import { formatBRL, formatQty } from "@/lib/format";
import { STORE_TIME_ZONE, zonedParts } from "@/lib/timezone";

/** The ledger's "Tipo" chips: consumo (sales/production), compras, transferências, ajustes. */
export type MovementKind = "consumo" | "compra" | "transf" | "ajuste";
/** Aberturas only show under "Todos" — they have no chip of their own. */
export type LedgerKind = MovementKind | "abertura";

export function movementKind(m: Pick<StockMovement, "type" | "reason" | "refOrder">): LedgerKind {
  if (m.type === "transferencia") return "transf";
  if (m.type === "abertura") return "abertura";
  // Sales, their reversals (AJUSTE tied to an order) and production all hang off an order/menu item.
  if (m.refOrder || m.reason === "VENDA" || m.reason === "CONSUMO") return "consumo";
  if (m.reason === "ENTRADA") return "compra";
  return "ajuste";
}

/** What a movement row prints; the sheet only lays it out. */
export interface LedgerRow {
  id: string;
  kind: LedgerKind;
  /** "Consumo ·", "Compra ·", "Abriu embalagem", "Ajuste · Contagem errada" */
  title: string;
  /** Highlighted tail of the title; an href makes it a link (orders only). */
  link?: { text: string; href?: string };
  meta: string;
  delta: string;
  tone: "ink" | "depot" | "amber";
  /** A manual entrada/saída: can be corrected or removed from the row. */
  editable: boolean;
}

export interface DescribeCtx {
  storeId: string;
  /** Package label for a count ("caixa"/"caixas"). */
  pkg: (n: number) => string;
  /** Loose unit label ("un"/"sachês"). */
  unit: (n: number) => string;
  continuousUse: boolean;
}

const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TIME_ZONE, day: "2-digit", month: "2-digit" });
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TIME_ZONE, weekday: "short" });
const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function timeLabel(iso: string): string {
  return clock.format(new Date(iso));
}

/** "Hoje", "Ontem · 13/10", "Sex · 02/10" — by calendar day in the store's time zone. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const key = (d: Date) => {
    const p = zonedParts(d);
    return Date.UTC(p.year, p.month - 1, p.day);
  };
  const days = Math.round((key(now) - key(then)) / 86_400_000);
  if (days <= 0) return "Hoje";
  const dm = dayMonth.format(then);
  if (days === 1) return `Ontem · ${dm}`;
  const wd = weekday.format(then).replace(".", "");
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} · ${dm}`;
}

/** Manual entrada/saída with no order or note attached — the only ones the user can edit. */
export function isEditableMovement(m: Pick<StockMovement, "type" | "refOrder" | "refItem">): boolean {
  return (m.type === "entrada" || m.type === "saida") && !m.refOrder && !m.refItem;
}

export function describeMovement(m: StockMovement, ctx: DescribeCtx): LedgerRow {
  const kind = movementKind(m);
  const who = m.by.split("@")[0];
  const time = timeLabel(m.at);
  const qtyText = m.byPackage
    ? `${formatQty(m.qty, ctx.pkg(m.qty))}`
    : ctx.continuousUse
      ? formatQty(m.qty, m.qty === 1 ? "uso" : "usos")
      : formatQty(m.qty, ctx.unit(m.qty));
  const sign = m.type === "entrada" || m.type === "transferencia" ? "+" : "−";
  const delta = m.type === "abertura" ? `−1 ${ctx.pkg(1)}` : `${sign}${qtyText}`;
  const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(" · ");
  const base = { id: m.id, kind, delta, editable: isEditableMovement(m) };

  switch (kind) {
    case "consumo": {
      const reversal = m.refItem?.startsWith("Estorno");
      const orderText = m.refItem && /^(Pedido|Estorno) #/.test(m.refItem) ? m.refItem : m.refOrder && `Pedido #${m.refOrder}`;
      const link = orderText
        ? {
            text: orderText.replace(/^(Pedido|Estorno) /, "Pedido "),
            href: m.refOrder ? `/painel/${ctx.storeId}/pedidos?order=${encodeURIComponent(m.refOrder)}` : undefined,
          }
        : m.refItem
          ? { text: m.refItem }
          : undefined;
      return { ...base, title: reversal ? "Estorno ·" : "Consumo ·", link, meta: join(time, who), tone: "ink" };
    }
    case "compra":
      return {
        ...base,
        title: m.price != null ? "Compra ·" : "Compra",
        link: m.price != null ? { text: formatBRL(m.byPackage ? m.price * m.qty : m.price) } : undefined,
        meta: join(`${qtyText} para o ${m.loc === "deposito" ? "depósito" : "loja"}`, who),
        tone: "depot",
      };
    case "transf":
      return {
        ...base,
        title: "Transferência ·",
        link: m.trCode ? { text: m.trCode } : undefined,
        meta: join("Depósito → Loja", m.note, time, who),
        tone: "depot",
      };
    case "abertura":
      return { ...base, title: "Abriu embalagem", meta: join(m.note, time, who), tone: "ink" };
    default: {
      // "Contagem errada · 2 → 3 un" → title "Ajuste · Contagem errada", detail goes to the meta line.
      const [head, ...rest] = (m.refItem ?? "").split(" · ");
      const label =
        head ||
        (m.reason === "PERDA" ? "Perda" : m.reason === "SAIDA" ? "Saída" : m.reason === "AJUSTE" ? "" : "");
      const isNote = head.startsWith("Embalagem esvaziada");
      return {
        ...base,
        title: isNote ? head : label ? `Ajuste · ${label}` : "Ajuste",
        meta: join(rest.join(" · "), who),
        tone: "amber",
      };
    }
  }
}
