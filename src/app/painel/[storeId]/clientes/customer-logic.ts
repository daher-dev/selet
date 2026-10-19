import type { ComponentType } from "react";
import { Crown } from "lucide-react";
import type { Customer, Order } from "@/lib/types";

/** Toggleable tag catalog for the form + row/detail chips (design custTagCatalog 2076-2080). */
export const TAG_CATALOG: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** chip text + background classes */
  chipClass: string;
  /** selected-toggle classes for the form */
  onClass: string;
}[] = [
  {
    id: "vip",
    label: "VIP",
    icon: Crown,
    chipClass: "bg-[#F6EAC6] text-[#8A6312]",
    onClass: "border-amber/40 bg-amber-wash text-amber",
  },
];

export function tagMeta(id: string) {
  return TAG_CATALOG.find((t) => t.id === id) ?? null;
}

/** Brazilian states for the address form's UF select (design Mock Clientes 4a). */
export const BR_STATES: { value: string; label: string }[] = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

/**
 * Builds a wa.me link from a raw phone string: strips non-digits and prepends
 * Brazil's country code (55) when absent. Returns null when there's no number.
 * Shared by the detail sheet's CTAs and the Aniversários segment's "Enviar
 * mensagem" row action (design Mock Clientes 2a).
 */
export function whatsappHref(phone: string | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

/** Avatar palette mirroring design custVisual (2082-2086). */
export function avatarClass(customer: Pick<Customer, "tags" | "archived">): string {
  if (customer.archived) return "bg-[#EEF1ED] text-[#7A857D]";
  if (customer.tags.includes("vip")) return "bg-[#F6EAC6] text-[#8A6312]";
  return "bg-mist text-[#3A7D44]";
}

/**
 * Client-side CRM logic mirroring the design's Clientes screen
 * (Selet Admin.dc.html reorderInfo 2167-2187, daysToBirthday 2360-2368,
 * fmtPhone 2337-2346, unpaidByCust 2917-2918). Kept framework-free so it can
 * be unit-tested and shared between the list, the detail drawer and the form.
 */

const DAY_MS = 86_400_000;

export const MONTHS_SHORT_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Live phone mask → "(27) 99999-0000" (design fmtPhone 2337-2344). */
export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Whole days until the customer's next birthday, or null when unknown
 * (design daysToBirthday 2360-2368).
 */
export function daysToBirthday(
  birthday: { day: number; month: number } | undefined,
  now: Date = new Date(),
): number | null {
  if (!birthday) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), birthday.month - 1, birthday.day);
  if (next < today) next = new Date(now.getFullYear() + 1, birthday.month - 1, birthday.day);
  return Math.round((next.getTime() - today.getTime()) / DAY_MS);
}

/** "12 de mar" style label for a day/month birthday. */
export function birthdayLabel(
  birthday: { day: number; month: number } | undefined,
): string {
  if (!birthday) return "";
  return `${birthday.day} de ${MONTHS_SHORT_PT[birthday.month - 1]}`;
}

/** "28/07" numeric style label — used in the Aniversários segment row (design
 * Mock Clientes 2a) where the long-form label would be too wide. */
export function birthdayShort(
  birthday: { day: number; month: number } | undefined,
): string {
  if (!birthday) return "";
  return `${String(birthday.day).padStart(2, "0")}/${String(birthday.month).padStart(2, "0")}`;
}

/**
 * Whole days since the customer's last order, or null when they've never
 * ordered — the Arquivados segment's "Sem pedidos há {N}d" line (design Mock
 * Clientes 2b).
 */
export function daysSinceLastOrder(
  lastOrderAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!lastOrderAt) return null;
  return Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY_MS);
}

/** Compact recency for the customer's last order (list secondary line). */
export function lastOrderLabel(
  lastOrderAt: string | null,
  now: Date = new Date(),
): string {
  if (!lastOrderAt) return "Sem pedidos ainda";
  const days = Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY_MS);
  if (days <= 0) return "Último pedido hoje";
  if (days === 1) return "Último pedido ontem";
  if (days < 7) return `Último pedido há ${days} dias`;
  if (days < 14) return "Último pedido há 1 semana";
  if (days < 60) return `Último pedido há ${Math.floor(days / 7)} semanas`;
  return `Último pedido há ${Math.floor(days / 30)} meses`;
}

/**
 * List-row secondary line: recency + order count, e.g. "Último pedido hoje
 * · 41 pedidos" (design Mock Clientes 1a). Skips the count when the customer
 * has never ordered — "Sem pedidos ainda" already says as much.
 */
export function lastOrderSummary(
  customer: Pick<Customer, "lastOrderAt" | "orderCount">,
  now: Date = new Date(),
): string {
  const recency = lastOrderLabel(customer.lastOrderAt, now);
  if (!customer.lastOrderAt) return recency;
  const count =
    customer.orderCount === 1 ? "1 pedido" : `${customer.orderCount} pedidos`;
  return `${recency} · ${count}`;
}

/**
 * Days until the customer's next birthday, but only when it's within the
 * "upcoming" window (design Mock Clientes 1a shows the birthday badge on
 * every segment, not just Aniversários — same ≤30-day threshold as the
 * Aniversários segment filter). Null outside that window or when unknown.
 */
export function upcomingBirthdayDays(
  birthday: { day: number; month: number } | undefined,
  now: Date = new Date(),
): number | null {
  const d = daysToBirthday(birthday, now);
  return d != null && d <= 30 ? d : null;
}

export interface UnpaidInfo {
  total: number; // centavos
  count: number;
}

/**
 * Maps customerId → open (unpaid, non-cancelled) receivables
 * (design unpaidByCust 2917-2918). Walk-in orders have no customerId.
 * A comped/nada-a-cobrar order (total 0) is never a receivable — mirrors the
 * summary-core unpaid-tally rule.
 */
export function buildUnpaidByCustomer(orders: Order[]): Map<string, UnpaidInfo> {
  const map = new Map<string, UnpaidInfo>();
  for (const o of orders) {
    if (o.paid || o.status === "cancelado" || !o.customerId || o.total <= 0) continue;
    const cur = map.get(o.customerId) ?? { total: 0, count: 0 };
    cur.total += o.total;
    cur.count += 1;
    map.set(o.customerId, cur);
  }
  return map;
}

/** Most-frequently ordered product name for this customer, or null. */
export function topProduct(orders: Order[]): string | null {
  const counts = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      counts.set(it.name, (counts.get(it.name) ?? 0) + it.qty);
    }
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best;
}

export interface Reorder {
  /** Signed days to the predicted next purchase (negative = overdue). */
  days: number;
  inactive: boolean;
  product: string;
  state: "reactivate" | "overdue" | "soon" | "ok";
  chip: string;
  /** Palette for chip + card, keyed by state. */
  chipClass: string;
  cardClass: string;
  accentClass: string;
  label: string;
  detail: string;
  cta: string;
}

/**
 * Repurchase prediction from lastOrderAt + avgReorderDays
 * (design reorderInfo 2167-2187). Returns null when there isn't enough signal
 * (no cadence or never ordered).
 */
export function computeReorder(
  customer: Customer,
  fallbackProduct: string | null,
  now: Date = new Date(),
): Reorder | null {
  if (customer.avgReorderDays == null || !customer.lastOrderAt) return null;
  const product = customer.reorderProduct || fallbackProduct || "o produto habitual";
  const daysSince = Math.floor(
    (now.getTime() - new Date(customer.lastOrderAt).getTime()) / DAY_MS,
  );
  const days = Math.round(customer.avgReorderDays - daysSince);
  const inactive = days <= -20;

  if (inactive) {
    return {
      days, inactive, product, state: "reactivate", chip: "Reativar",
      chipClass: "bg-[#EEF1ED] text-[#7A857D]",
      cardClass: "border-[#F0E4C8] bg-[#FBF6EC]",
      accentClass: "text-amber",
      label: "Cliente inativo há mais de um mês",
      detail: `Sem comprar ${product} há semanas`,
      cta: "Reativar cliente",
    };
  }
  if (days <= 0) {
    return {
      days, inactive, product, state: "overdue", chip: `Atrasado ${-days}d`,
      chipClass: "bg-[#FBE9E4] text-[#C0492F]",
      cardClass: "border-[#F2D8CF] bg-[#FBF1EE]",
      accentClass: "text-[#C0492F]",
      label: `Recompra atrasada há ${-days} dias`,
      detail: `${product} já deve ter acabado`,
      cta: "Contatar agora",
    };
  }
  if (days <= 2) {
    return {
      days, inactive, product, state: "soon", chip: `Em ${days}d`,
      chipClass: "bg-[#F6EAC6] text-[#8A6312]",
      cardClass: "border-[#F0E4C8] bg-[#FBF6EC]",
      accentClass: "text-amber",
      label: `Recompra em ~${days} dias`,
      detail: `${product} acabando — bom momento de contato`,
      cta: "Lembrar recompra",
    };
  }
  return {
    days, inactive, product, state: "ok", chip: `Em ${days}d`,
    chipClass: "bg-mist text-[#3A7D44]",
    cardClass: "border-[#DCEBD4] bg-[#F4F9F1]",
    accentClass: "text-primary",
    label: `Recompra em ~${days} dias`,
    detail: `Baseado no consumo de ${product}`,
    cta: "Agendar lembrete",
  };
}

/** Lowercase, prefix-free recency for embedding mid-sentence, e.g. "…último
 * pedido {hoje|ontem|há N dias}." (design Mock Clientes 3a rhythm line). */
export function lastOrderRecencyPhrase(
  lastOrderAt: string | null,
  now: Date = new Date(),
): string {
  if (!lastOrderAt) return "sem pedidos ainda";
  const days = Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY_MS);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

export interface RhythmInfo {
  tone: "ok" | "unknown";
  text: string;
}

/**
 * Compact rhythm status line shown under the ticket médio hero card (design
 * Mock Clientes 3a "Em dia — costuma vir a cada 6 dias, último pedido hoje."
 * / 3b "Ritmo de compra ainda sem leitura — o sistema precisa de 3 pedidos.").
 * Returns null when the reorder state is overdue/reactivate — those states
 * get the top-of-sheet alert card instead (design 3c), not this line.
 */
export function computeRhythm(
  customer: Customer,
  reorder: Reorder | null,
  now: Date = new Date(),
): RhythmInfo | null {
  if (reorder && (reorder.state === "overdue" || reorder.state === "reactivate")) {
    return null;
  }
  if (!reorder || customer.avgReorderDays == null) {
    return {
      tone: "unknown",
      text: "Ritmo de compra ainda sem leitura — o sistema precisa de 3 pedidos.",
    };
  }
  const avg = Math.round(customer.avgReorderDays);
  return {
    tone: "ok",
    text: `Em dia — costuma vir a cada ${avg} dias, último pedido ${lastOrderRecencyPhrase(customer.lastOrderAt, now)}.`,
  };
}

/**
 * Store-wide average ticket (centavos) across non-archived customers with at
 * least one order — the "vs. média da loja" comparison in the ticket médio
 * hero card (design Mock Clientes 3a/3c). Null when nobody has ordered yet.
 */
export function computeStoreAvgTicket(customers: Customer[]): number | null {
  let spent = 0;
  let count = 0;
  for (const c of customers) {
    if (c.archived) continue;
    spent += c.totalSpent;
    count += c.orderCount;
  }
  return count > 0 ? spent / count : null;
}

/**
 * Whether a customer counts as "Novo" for the auto-computed tags-column badge
 * (design Mock Clientes 1a, João Pedro row) — same "system needs 3 orders"
 * threshold as the rhythm line, and only shown when there's no manual tag to
 * take its place.
 */
export function isNewCustomer(
  customer: Pick<Customer, "orderCount" | "tags" | "archived">,
): boolean {
  return !customer.archived && customer.orderCount < 3 && customer.tags.length === 0;
}

/**
 * Days overdue for the list row's Tags-column badge (design Mock Clientes 1a,
 * Luiza Castro row: the "Atrasada 14d" pill replaces "—"/the tag chips in
 * that column, it isn't a third under-name badge alongside birthday/unpaid —
 * those two are already capped at two by simply being the only two kinds).
 * Covers both "overdue" and the more severe "reactivate" reorder states.
 * Cheap by design: pass `null` as computeReorder's fallbackProduct — the row
 * only needs the day count, not the predicted product name.
 */
export function rowOverdueDays(customer: Customer, now: Date = new Date()): number | null {
  const reorder = computeReorder(customer, null, now);
  if (!reorder) return null;
  if (reorder.state !== "overdue" && reorder.state !== "reactivate") return null;
  return -reorder.days;
}
