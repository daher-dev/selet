import type { OrderItem } from "./types";

/** The order fields the audit trail tracks. `createdAt` is "Data da venda" (ISO). */
export interface AuditSnap {
  status: string;
  paid: boolean;
  payMethod: string | null;
  total: number; // centavos
  customerName: string;
  channel: string;
  createdAt: string;
  sellerEmail: string | null;
  notes: string | null;
  items: string[];
}

export interface AuditChange {
  field: keyof AuditSnap;
  from: unknown;
  to: unknown;
}

export const itemLabels = (items: OrderItem[]): string[] => items.map((i) => `${i.qty}× ${i.name}`);

/** Field-by-field diff; `before: null` (creation) lists every field as set. */
export function auditChanges(before: AuditSnap | null, after: AuditSnap): AuditChange[] {
  const out: AuditChange[] = [];
  for (const field of Object.keys(after) as (keyof AuditSnap)[]) {
    const from = before ? before[field] : null;
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field, from, to });
  }
  return out;
}
