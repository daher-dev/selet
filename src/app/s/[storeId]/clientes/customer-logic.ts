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

export interface UnpaidInfo {
  total: number; // centavos
  count: number;
}

/**
 * Maps customerId → open (unpaid, non-cancelled) receivables
 * (design unpaidByCust 2917-2918). Walk-in orders have no customerId.
 */
export function buildUnpaidByCustomer(orders: Order[]): Map<string, UnpaidInfo> {
  const map = new Map<string, UnpaidInfo>();
  for (const o of orders) {
    if (o.paid || o.status === "cancelado" || !o.customerId) continue;
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
