"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Cake,
  CalendarDays,
  Crown,
  AtSign,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCcw,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import type { Customer, Order } from "@/lib/types";
import { formatBRL, formatDateShort, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setCustomerArchivedAction } from "@/actions/customers";
import { STATUS_META } from "@/components/order-meta";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** How many recent orders to surface in the detail sheet. */
const RECENT_ORDERS_LIMIT = 5;

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

const MONTHS_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

interface CustomerDetailSheetProps {
  storeId: string;
  customer: Customer | null;
  /** This customer's orders, newest-first. */
  orders: Order[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (customer: Customer) => void;
}

export function CustomerDetailSheet({
  storeId,
  customer,
  orders,
  open,
  onOpenChange,
  onEdit,
}: CustomerDetailSheetProps) {
  const [pending, startTransition] = useTransition();

  const waHref = whatsappHref(customer?.phone);
  const recentOrders = orders.slice(0, RECENT_ORDERS_LIMIT);
  // Average ticket — guard against dividing by zero for customers with no orders.
  const avgTicket =
    customer && customer.orderCount > 0
      ? Math.round(customer.totalSpent / customer.orderCount)
      : null;

  function toggleArchived() {
    if (!customer) return;
    startTransition(async () => {
      const result = await setCustomerArchivedAction(
        storeId,
        customer.id,
        !customer.archived,
      );
      if (result.ok) {
        toast.success(
          customer.archived ? "Cliente reativado." : "Cliente arquivado.",
        );
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        {customer && (
          <>
            <SheetHeader className="border-b border-border">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
                    customer.tags.includes("vip")
                      ? "bg-amber-wash text-amber"
                      : "bg-mist text-primary",
                  )}
                >
                  {initials(customer.name)}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-1.5 text-[17px] font-bold">
                    <span className="truncate">{customer.name}</span>
                    {customer.tags.includes("vip") && (
                      <Crown className="size-4 shrink-0 text-amber" />
                    )}
                  </SheetTitle>
                  {customer.archived && (
                    <p className="text-[11.5px] font-semibold text-ink-faint">
                      Arquivado
                    </p>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 p-4">
              {/* Lifetime aggregates */}
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Pedidos" value={String(customer.orderCount)} />
                <Stat label="Total gasto" value={formatBRL(customer.totalSpent)} />
                <Stat
                  label="Ticket médio"
                  value={avgTicket !== null ? formatBRL(avgTicket) : "—"}
                />
                <Stat
                  label="Última compra"
                  value={
                    customer.lastOrderAt
                      ? formatDateShort(customer.lastOrderAt)
                      : "—"
                  }
                />
              </div>

              {/* Reorder hint */}
              {customer.avgReorderDays !== null && customer.lastOrderAt && (
                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
                  <RefreshCcw className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-[12.5px] leading-normal text-ink-soft">
                    Costuma recomprar a cada{" "}
                    <strong className="text-ink">
                      {Math.round(customer.avgReorderDays)} dias
                    </strong>
                    .
                  </p>
                </div>
              )}

              {/* Contact & dates */}
              <div className="space-y-2.5 rounded-2xl border border-border bg-card p-4">
                {customer.phone && (
                  <InfoRow icon={Phone} label="Telefone" value={customer.phone} />
                )}
                {customer.instagram && (
                  <InfoRow
                    icon={AtSign}
                    label="Instagram"
                    value={`@${customer.instagram}`}
                  />
                )}
                {customer.city && (
                  <InfoRow icon={MapPin} label="Cidade" value={customer.city} />
                )}
                {customer.birthday && (
                  <InfoRow
                    icon={Cake}
                    label="Aniversário"
                    value={`${customer.birthday.day} de ${MONTHS_SHORT[customer.birthday.month - 1]}`}
                  />
                )}
                {customer.since && (
                  <InfoRow
                    icon={CalendarDays}
                    label="Cliente desde"
                    value={formatDateShort(customer.since)}
                  />
                )}
              </div>

              {customer.notes && (
                <div className="rounded-2xl border border-border bg-paper p-4">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    Notas
                  </p>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                    {customer.notes}
                  </p>
                </div>
              )}

              {/* Recent order history */}
              {recentOrders.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    Histórico recente
                  </p>
                  <ul>
                    {recentOrders.map((order) => {
                      const status = STATUS_META[order.status];
                      const itemsSummary =
                        order.items
                          .map((i) => `${i.qty}× ${i.name}`)
                          .join(", ") || "Pedido";
                      return (
                        <li
                          key={order.id}
                          className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-ink">
                              {itemsSummary}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-[11.5px] text-ink-faint">
                                {formatDateShort(order.createdAt)}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                  status.bg,
                                  status.fg,
                                )}
                              >
                                {status.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <span className="tabular text-[13px] font-bold text-ink">
                              {formatBRL(order.total)}
                            </span>
                            <Link
                              href={`/s/${storeId}/pedidos`}
                              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11.5px] font-semibold text-primary transition-colors hover:bg-mist"
                            >
                              <Repeat className="size-3" />
                              Repetir
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={toggleArchived}
                disabled={pending}
                className={cn(
                  "w-full gap-1.5 rounded-xl",
                  customer.archived
                    ? "text-primary hover:bg-mist hover:text-primary"
                    : "text-ink-faint hover:bg-wash hover:text-ink",
                )}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : customer.archived ? (
                  <ArchiveRestore className="size-4" />
                ) : (
                  <Archive className="size-4" />
                )}
                {customer.archived ? "Reativar cliente" : "Arquivar cliente"}
              </Button>
            </div>

            <SheetFooter className="border-t border-border">
              {waHref && (
                <Button
                  asChild
                  className="w-full gap-1.5 rounded-xl font-semibold"
                >
                  <a href={waHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" />
                    Enviar no WhatsApp
                  </a>
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 rounded-xl"
                >
                  Fechar
                </Button>
                <Button
                  variant={waHref ? "outline" : "default"}
                  onClick={() => onEdit(customer)}
                  className="flex-1 gap-1.5 rounded-xl font-semibold"
                >
                  <Pencil className="size-4" />
                  Editar cliente
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-3 text-center">
      <p className="tabular text-[15px] font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-ink-faint" />
      <span className="w-24 shrink-0 text-[12px] text-ink-faint">{label}</span>
      <span className="min-w-0 truncate text-[13px] font-medium text-ink">
        {value}
      </span>
    </div>
  );
}
