import { formatBRL, formatDate, formatTime } from "./format";
import { isoToDateInput, isoToTimeInput } from "./timezone";
import type { Order, StoreReceipt } from "./types";

/**
 * Pix receipt ("Recibo") generated on demand from a paid order — nothing is
 * persisted. The store's fixed data comes from Configurações → Loja; customer,
 * amount and date come from the order and can be adjusted before download.
 * Design: artifact boards pedidos-8a…8d, configuracoes-1b.
 */

/** Fields the receipt can't be issued without. */
export const RECEIPT_REQUIRED = ["recipient", "institution", "pixKey"] as const;

/** Only saved, non-cancelled orders already paid via Pix offer a receipt. */
export function canIssueReceipt(order: Order | null): order is Order {
  return Boolean(
    order &&
      order.status !== "cancelado" &&
      order.paid &&
      order.payMethod === "pix" &&
      order.total > 0,
  );
}

/** True when the store has every required fixed field filled in. */
export function receiptConfigured(settings: StoreReceipt | undefined): boolean {
  return RECEIPT_REQUIRED.every((k) => Boolean(settings?.[k]?.trim()));
}

export interface ReceiptData {
  /** Store display name, e.g. "Vila Velha/ES". */
  storeName: string;
  orderCode: string;
  settings: StoreReceipt;
  customer: string;
  /** Centavos. */
  amount: number;
  /** "2026-11-16" (input[type=date]). */
  date: string;
  /** "15:47" (input[type=time]). */
  time: string;
  generatedAt: Date;
}

/** Dialog defaults: customer, total and sale date/time of the order. */
export function receiptDefaults(order: Order): Pick<ReceiptData, "customer" | "amount" | "date" | "time"> {
  return {
    customer: order.customerName ?? "",
    amount: order.total,
    date: isoToDateInput(order.createdAt),
    time: isoToTimeInput(order.createdAt),
  };
}

/** "2026-11-16" + "15:47" → "16/11/2026, 15:47". */
export function formatReceiptDate(date: string, time: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}, ${time}`;
}

/** BRL with plain spaces (Intl uses a non-breaking one). */
export function formatReceiptAmount(centavos: number): string {
  return formatBRL(centavos).replace(/[  ]/g, " ");
}

/** Label/value rows in print order; optional lines are left out when empty. */
export function receiptRows(data: ReceiptData): [string, string][] {
  const s = data.settings;
  const rows: [string, string | undefined][] = [
    ["Para", s.recipient],
    ["Instituição", s.institution],
    ["Chave Pix", s.pixKey],
    ["Cliente", data.customer],
    ["Data", formatReceiptDate(data.date, data.time)],
    ["Carteira", s.wallet],
    ["Categoria", s.category],
  ];
  return rows
    .map(([label, value]) => [label, value?.trim() ?? ""] as [string, string])
    .filter(([, value]) => value !== "");
}

/** "Gerado em 17/11/2026 às 10:12 · Selet Vila Velha/ES". */
export function receiptFooter(data: ReceiptData): string {
  const iso = data.generatedAt.toISOString();
  return `Gerado em ${formatDate(iso)} às ${formatTime(iso)} · Selet ${data.storeName}`;
}

export function receiptFileName(orderCode: string): string {
  return `recibo-${orderCode}.pdf`;
}

// Characters the standard PDF fonts (WinAnsi) encode beyond Latin-1.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Drops what the standard PDF fonts can't draw (emoji etc.) so rendering never throws. */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC").replace(/[  \t\r\n]/g, " ")) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
  }
  return out.replace(/ {2,}/g, " ").trim();
}
