"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  AtSign,
  Cake,
  CheckCircle2,
  FileText,
  Layers,
  MessageCircle,
  Pencil,
  Repeat,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import type { Cartela, Customer, Order } from "@/lib/types";
import { formatBRL, formatDate, initials } from "@/lib/format";
import { punchStates, remainingUses } from "@/lib/cartelas";
import { cn } from "@/lib/utils";
import { CartelaPunchDots } from "@/components/cartela-punch-dots";
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
  computeRhythm,
  MONTHS_SHORT_PT,
  tagMeta,
  topProduct,
  whatsappHref,
  type Reorder,
  type RhythmInfo,
  type UnpaidInfo,
} from "./customer-logic";

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

/** Signed BRL delta, e.g. "+R$ 6,40" / "−R$ 1,40" (design Mock Clientes 3a/3c). */
function formatSignedBRL(deltaCentavos: number): string {
  const abs = formatBRL(Math.abs(deltaCentavos));
  return deltaCentavos >= 0 ? `+${abs}` : `−${abs}`;
}

interface CustomerDetailSheetProps {
  storeId: string;
  customer: Customer | null;
  /** This customer's orders, newest-first. */
  orders: Order[];
  /** This customer's cartelas (any status) — the summary card shows the most relevant one. */
  cartelas: Cartela[];
  unpaid: UnpaidInfo | null;
  /** Store-wide average ticket (centavos), for the "vs. média da loja" comparison. */
  storeAvgTicket: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (customer: Customer) => void;
}

export function CustomerDetailSheet({
  storeId,
  customer,
  orders,
  cartelas,
  unpaid,
  storeAvgTicket,
  open,
  onOpenChange,
  onEdit,
}: CustomerDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        {customer && (
          // Keyed by customer id so the "Ignorar" dismissal (local state) resets
          // when a different customer's sheet opens.
          <CustomerDetailBody
            key={customer.id}
            storeId={storeId}
            customer={customer}
            orders={orders}
            cartelas={cartelas}
            unpaid={unpaid}
            storeAvgTicket={storeAvgTicket}
            onEdit={onEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CustomerDetailBody({
  storeId,
  customer,
  orders,
  cartelas,
  unpaid,
  storeAvgTicket,
  onEdit,
  onClose,
}: {
  storeId: string;
  customer: Customer;
  orders: Order[];
  cartelas: Cartela[];
  unpaid: UnpaidInfo | null;
  storeAvgTicket: number | null;
  onEdit: (customer: Customer) => void;
  onClose: () => void;
}) {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const waHref = whatsappHref(customer.phone);
  const avgTicket =
    customer.orderCount > 0
      ? Math.round(customer.totalSpent / customer.orderCount)
      : null;
  const reorder = computeReorder(customer, topProduct(orders));
  const rhythm = computeRhythm(customer, reorder);
  // Overdue/reactivate get the top alert card (design 3c) instead of the
  // compact rhythm line — one reorder surface per state, not two.
  const showAlert =
    !alertDismissed &&
    reorder != null &&
    (reorder.state === "overdue" || reorder.state === "reactivate");
  const topOrders = [...orders]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const tags = customer.tags
    .map((id) => tagMeta(id))
    .filter((t): t is NonNullable<typeof t> => t != null);
  // Most relevant cartela for the summary card: cancelled ones are hidden
  // (decision: cancelling drops a cartela out of active-facing views), and
  // among the rest the most recently purchased wins — a customer should only
  // ever have one live cartela at a time in the common case.
  const cartela = [...cartelas]
    .filter((c) => c.status !== "cancelada")
    .sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1))[0] ?? null;

  return (
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
          onClick={onClose}
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

        {/* "Fora do ritmo" alert (design Mock Clientes 3c) */}
        {showAlert && reorder && (
          <OverdueAlertCard
            reorder={reorder}
            avgReorderDays={customer.avgReorderDays}
            waHref={waHref}
            onIgnore={() => setAlertDismissed(true)}
          />
        )}

        {/* Contact block: instagram + aniversário + cliente desde (design Mock Clientes 3a) */}
        {(customer.instagram || customer.birthday || customer.since) && (
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
            {customer.since && (
              <ContactRow
                icon={<Layers className="size-4 text-ink-faint" />}
                label="Cliente desde"
                value={sinceLabel(customer.since)}
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

        {/* Ticket médio hero card (design Mock Clientes 3a/3b/3c) */}
        <TicketMedioCard
          customer={customer}
          avgTicket={avgTicket}
          storeAvgTicket={storeAvgTicket}
        />

        {/* Compact rhythm line — only when the top alert isn't already showing it */}
        {!showAlert && rhythm && <RhythmLine info={rhythm} />}

        {/* Cartela summary card (design Mock Clientes 333-345) */}
        {cartela && (
          <div className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-baseline gap-2">
              <p className="flex-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                Cartela
              </p>
              <p className="text-[12.5px] text-ink-faint">
                #{cartela.code} · comprada {formatDate(cartela.purchasedAt)}
              </p>
            </div>
            <div className="mt-[7px] flex items-baseline gap-2">
              <span className="tabular text-[22px] font-bold leading-none tracking-tight text-ink">
                {remainingUses(cartela)}
              </span>
              <span className="text-[12.5px] text-ink-faint">
                de {cartela.totalUses} usos livres · {formatBRL(cartela.unitValue)} por uso
              </span>
            </div>
            <div className="mt-3">
              <CartelaPunchDots states={punchStates(cartela)} />
            </div>
          </div>
        )}

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

      {/* Footer WhatsApp CTA — skipped when the top alert already offers one */}
      {waHref && !showAlert && (
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
  );
}

function TicketMedioCard({
  customer,
  avgTicket,
  storeAvgTicket,
}: {
  customer: Customer;
  avgTicket: number | null;
  storeAvgTicket: number | null;
}) {
  // Design 3b: fewer than 3 orders, the average isn't trustworthy yet — show
  // the order count instead of a vs.-store comparison.
  const unstable = customer.orderCount < 3;
  const delta =
    !unstable && avgTicket !== null && storeAvgTicket !== null
      ? avgTicket - Math.round(storeAvgTicket)
      : null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-paper">
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Ticket médio
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="tabular text-[26px] font-bold leading-none tracking-tight text-ink">
            {avgTicket !== null ? formatBRL(avgTicket) : "—"}
          </span>
          {unstable ? (
            <span className="text-[12px] text-ink-faint">
              {customer.orderCount === 1 ? "1 pedido" : `${customer.orderCount} pedidos`} — média ainda instável
            </span>
          ) : (
            delta !== null && (
              <span
                className={cn(
                  "text-[12px] font-semibold",
                  delta >= 0 ? "text-primary" : "text-ink-faint",
                )}
              >
                {formatSignedBRL(delta)} vs. média da loja
              </span>
            )
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border bg-card">
        <div className="border-r border-border px-4 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            Pedidos
          </p>
          <p className="tabular mt-0.5 text-[16px] font-bold text-ink">
            {customer.orderCount}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            Total gasto
          </p>
          <p className="tabular mt-0.5 text-[16px] font-bold text-ink">
            {formatBRL(customer.totalSpent)}
          </p>
        </div>
      </div>
    </div>
  );
}

function RhythmLine({ info }: { info: RhythmInfo }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
        info.tone === "ok"
          ? "border-[#DCEAD4] bg-[#F2F8EF]"
          : "border-dashed border-border bg-paper",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          info.tone === "ok" ? "bg-primary" : "bg-[#C5CFC7]",
        )}
      />
      <span
        className={cn(
          "text-[12.5px]",
          info.tone === "ok" ? "text-[#37543F]" : "text-ink-faint",
        )}
      >
        {info.text}
      </span>
    </div>
  );
}

function OverdueAlertCard({
  reorder,
  avgReorderDays,
  waHref,
  onIgnore,
}: {
  reorder: Reorder;
  avgReorderDays: number | null;
  waHref: string | null;
  onIgnore: () => void;
}) {
  const overdueDays = -reorder.days;
  const normalDays = avgReorderDays != null ? Math.round(avgReorderDays) : null;
  // The two-tone progress bar only makes sense for "overdue" — a normal
  // cadence to compare against. "reactivate" (customer gone quiet for a
  // month+) has nothing meaningful to size a bar against, so it's text-only.
  // Requires normalDays > 0 too: a same-day cadence (rounds to 0) would
  // divide 0/(0+overdueDays)=0 or, when overdueDays is also 0, 0/0=NaN —
  // either way there's no ratio to draw.
  const showBar = reorder.state === "overdue" && normalDays != null && normalDays > 0;
  const normalShare = showBar
    ? Math.min(65, Math.max(20, (normalDays! / (normalDays! + overdueDays)) * 100))
    : 0;

  return (
    <div className={cn("overflow-hidden rounded-2xl border", reorder.cardClass)}>
      <div className="p-4">
        <p
          className={cn(
            "flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider",
            reorder.accentClass,
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          Fora do ritmo
        </p>
        <p className={cn("mt-2 text-[16px] font-bold leading-snug", reorder.accentClass)}>
          {reorder.label}
        </p>
        {showBar && (
          <div className="mt-3.5">
            <div className="flex h-2 overflow-hidden rounded-full">
              <span className="bg-[#C8E0BE]" style={{ width: `${normalShare}%` }} />
              <span
                className="flex-1"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(115deg, #C0492B 0px, #C0492B 5px, #AC3E22 5px, #AC3E22 10px)",
                }}
              />
            </div>
            <div
              className={cn(
                "mt-1.5 flex justify-between text-[11px] font-semibold",
                reorder.accentClass,
              )}
            >
              <span>ritmo normal · {normalDays}d</span>
              <span>{overdueDays} dias de atraso</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-current/15 p-3">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90",
              reorder.state === "overdue" ? "bg-[#A83D22]" : "bg-amber",
            )}
          >
            <MessageCircle className="size-4" />
            {reorder.cta}
          </a>
        )}
        <button
          type="button"
          onClick={onIgnore}
          className={cn(
            "flex items-center justify-center rounded-xl border bg-white/60 px-4 text-[13px] font-semibold transition-colors hover:bg-white",
            reorder.accentClass,
          )}
          style={{ borderColor: "currentColor" }}
        >
          Ignorar
        </button>
      </div>
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
