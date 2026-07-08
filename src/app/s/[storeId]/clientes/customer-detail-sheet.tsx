"use client";

import Link from "next/link";
import {
  Archive,
  AtSign,
  Cake,
  CalendarClock,
  CheckCircle2,
  FileText,
  MessageCircle,
  Pencil,
  Repeat,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import type { Customer, Order } from "@/lib/types";
import { formatBRL, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  avatarClass,
  birthdayLabel,
  computeReorder,
  MONTHS_SHORT_PT,
  tagMeta,
  topProduct,
  type UnpaidInfo,
} from "./customer-logic";

/**
 * Builds a wa.me link from a raw phone string: strips non-digits and prepends
 * Brazil's country code (55) when absent. Returns null when there's no number.
 */
function whatsappHref(phone: string | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

/** Compact recency for the timeline "Último" node. */
function shortRecency(lastOrderAt: string | null): string {
  if (!lastOrderAt) return "—";
  const days = Math.floor(
    (Date.now() - new Date(lastOrderAt).getTime()) / 86_400_000,
  );
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 14) return `${days} dias`;
  if (days < 60) return `${Math.floor(days / 7)} sem`;
  return `${Math.floor(days / 30)} meses`;
}

/** "Mar/2023" style label for the ISO "since" date. */
function sinceLabel(since: string): string {
  if (!since) return "—";
  const d = new Date(since);
  const m = MONTHS_SHORT_PT[d.getMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)}/${d.getFullYear()}`;
}

interface CustomerDetailSheetProps {
  storeId: string;
  customer: Customer | null;
  /** This customer's orders, newest-first. */
  orders: Order[];
  unpaid: UnpaidInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (customer: Customer) => void;
}

export function CustomerDetailSheet({
  storeId,
  customer,
  orders,
  unpaid,
  open,
  onOpenChange,
  onEdit,
}: CustomerDetailSheetProps) {
  const waHref = whatsappHref(customer?.phone);
  const avgTicket =
    customer && customer.orderCount > 0
      ? Math.round(customer.totalSpent / customer.orderCount)
      : null;
  const reorder = customer
    ? computeReorder(customer, topProduct(orders))
    : null;
  const topOrders = [...orders]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const tags = customer
    ? customer.tags
        .map((id) => tagMeta(id))
        .filter((t): t is NonNullable<typeof t> => t != null)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        {customer && (
          <>
            <SheetHeader className="flex-row items-center gap-3 border-b border-border p-5">
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-full text-[16px] font-bold",
                  avatarClass(customer),
                )}
              >
                {initials(customer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-[18px] font-bold">
                  {customer.name}
                </SheetTitle>
                {customer.phone && (
                  <p className="truncate text-[12.5px] text-ink-faint">
                    {customer.phone}
                  </p>
                )}
              </div>
              {customer.archived && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1ED] px-2.5 py-1 text-[11px] font-bold text-[#7A857D]">
                  <Archive className="size-3" />
                  Arquivado
                </span>
              )}
              <button
                type="button"
                onClick={() => onEdit(customer)}
                aria-label="Editar cliente"
                className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-ink-soft transition-colors hover:bg-mist"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-ink-soft transition-colors hover:bg-mist"
              >
                <X className="size-4" />
              </button>
            </SheetHeader>

            <div className="flex-1 space-y-4 p-5">
              {/* Tag chips */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold",
                        t.chipClass,
                      )}
                    >
                      <t.icon className="size-3.5" />
                      {t.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Contact block: instagram + aniversário (design 100-116) */}
              {(customer.instagram || customer.birthday) && (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {customer.instagram && (
                    <ContactRow
                      icon={<AtSign className="size-4 text-[#C2407E]" />}
                      label="Instagram"
                      value={`@${customer.instagram}`}
                      valueClass="text-[#C2407E]"
                    />
                  )}
                  {customer.birthday && (
                    <ContactRow
                      icon={<Cake className="size-4 text-ink-faint" />}
                      label="Aniversário"
                      value={birthdayLabel(customer.birthday)}
                    />
                  )}
                </div>
              )}

              {/* Notes */}
              {customer.notes && (
                <div className="rounded-xl border border-[#F0E4C8] bg-[#FBF6EC] p-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-amber">
                    <FileText className="size-3" />
                    Anotações
                  </p>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#5C4A1E]">
                    {customer.notes}
                  </p>
                </div>
              )}

              {/* A receber banner (design 126-135) */}
              {unpaid && (
                <div className="flex items-center gap-3 rounded-xl border border-[#F0E4C8] bg-[#FBF6EC] p-3.5">
                  <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#F6EAC6] text-amber">
                    <Wallet className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-[#8A6312]">
                      A receber
                    </span>
                    <span className="block text-[11.5px] text-[#A0895A]">
                      {unpaid.count === 1
                        ? "1 pedido em aberto"
                        : `${unpaid.count} pedidos em aberto`}
                    </span>
                  </span>
                  <span className="tabular whitespace-nowrap text-[20px] font-bold text-amber">
                    {formatBRL(unpaid.total)}
                  </span>
                </div>
              )}

              {/* Green 3-cell stats banner (design 137-152) */}
              <div className="flex items-stretch overflow-hidden rounded-2xl bg-primary text-white">
                <StatCell value={formatBRL(customer.totalSpent)} label="Total gasto" />
                <span className="w-px bg-white/15" />
                <StatCell value={String(customer.orderCount)} label="Pedidos" />
                <span className="w-px bg-white/15" />
                <StatCell
                  value={avgTicket !== null ? formatBRL(avgTicket) : "—"}
                  label="Ticket médio"
                />
              </div>

              {/* 4-node timeline (design 154-176) */}
              <div className="relative flex justify-between gap-1 rounded-2xl border border-border px-2 pb-1 pt-4">
                <span className="absolute left-[34px] right-[34px] top-[34px] h-0.5 bg-border" />
                <TimelineNode
                  icon={<UserPlus className="size-4" />}
                  wrapClass="bg-[#EEF1ED] text-[#7A857D]"
                  label="1ª compra"
                  value={sinceLabel(customer.since)}
                />
                <TimelineNode
                  icon={<CheckCircle2 className="size-4" />}
                  wrapClass="bg-mist text-[#3A7D44]"
                  label="Último"
                  value={shortRecency(customer.lastOrderAt)}
                />
                <TimelineNode
                  icon={<Repeat className="size-4" />}
                  wrapClass={cn(
                    reorder ? reorder.chipClass : "bg-[#EEF1ED] text-[#7A857D]",
                  )}
                  label="Próximo"
                  value={reorder ? (reorder.inactive ? "Inativo" : reorder.chip) : "—"}
                  valueClass={reorder?.accentClass}
                />
                <TimelineNode
                  icon={<Cake className="size-4" />}
                  wrapClass="bg-[#F8E9F1] text-[#C2407E]"
                  label="Aniversário"
                  value={
                    customer.birthday
                      ? `${String(customer.birthday.day).padStart(2, "0")}/${String(customer.birthday.month).padStart(2, "0")}`
                      : "—"
                  }
                />
              </div>

              {/* Reorder-prediction card (design reorderInfo 2167-2187) */}
              {reorder && (
                <div className={cn("rounded-2xl border p-4", reorder.cardClass)}>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/70",
                        reorder.accentClass,
                      )}
                    >
                      <CalendarClock className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-[13.5px] font-bold", reorder.accentClass)}>
                          {reorder.label}
                        </p>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                            reorder.chipClass,
                          )}
                        >
                          {reorder.chip}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-normal text-ink-soft">
                        {reorder.detail}
                      </p>
                    </div>
                  </div>
                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "mt-3 flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/60",
                        reorder.accentClass,
                      )}
                      style={{ borderColor: "currentColor" }}
                    >
                      <MessageCircle className="size-4" />
                      {reorder.cta}
                    </a>
                  )}
                </div>
              )}

              {/* Pedidos favoritos — top 3 by value (design 178-191) */}
              {topOrders.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    Pedidos favoritos
                  </p>
                  <div className="space-y-2">
                    {topOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-paper px-3.5 py-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">
                            {order.items.map((i) => `${i.qty}× ${i.name}`).join(", ") ||
                              "Pedido"}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                            {formatBRL(order.total)}
                          </span>
                        </span>
                        <RepeatButton storeId={storeId} customerId={customer.id} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico recente (design 193-207) */}
              {orders.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    Histórico recente
                  </p>
                  <ul>
                    {orders.slice(0, 5).map((order) => (
                      <li
                        key={order.id}
                        className="flex items-center gap-3 border-t border-muted py-2.5 first:border-t-0"
                      >
                        <span className="size-2 shrink-0 rounded-full bg-leaf" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink-soft">
                            {order.items.map((i) => `${i.qty}× ${i.name}`).join(", ") ||
                              "Pedido"}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[13px] font-bold text-ink">
                          {formatBRL(order.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {waHref && (
              <div className="border-t border-border p-4">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-[14px] font-semibold text-white shadow-[0_3px_8px_-3px_rgba(24,107,65,.6)] transition-transform hover:-translate-y-0.5"
                >
                  <MessageCircle className="size-4" />
                  Enviar no WhatsApp
                </a>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1 px-2 py-4 text-center">
      <div className="tabular whitespace-nowrap text-[clamp(17px,5vw,22px)] font-bold leading-none">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[#B5D9C4]">{label}</div>
    </div>
  );
}

function TimelineNode({
  icon,
  wrapClass,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  wrapClass: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
      <span
        className={cn(
          "z-[1] flex size-9 items-center justify-center rounded-full",
          wrapClass,
        )}
      >
        {icon}
      </span>
      <span className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <span
        className={cn(
          "text-[12px] font-bold leading-tight text-ink",
          valueClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card px-3.5 py-3">
      {icon}
      <span className="flex-1 text-[12px] text-ink-faint">{label}</span>
      <span className={cn("text-[13px] font-semibold text-ink", valueClass)}>
        {value}
      </span>
    </div>
  );
}

function RepeatButton({
  storeId,
  customerId,
}: {
  storeId: string;
  customerId: string;
}) {
  return (
    <Link
      href={`/s/${storeId}/pedidos?cliente=${customerId}`}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#DCEBD4] bg-card px-3 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-mist"
    >
      <Repeat className="size-3.5" />
      Repetir
    </Link>
  );
}
