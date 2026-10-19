"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Cake,
  ChevronDown,
  Clock,
  Crown,
  ListFilter,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Cartela, Customer, Order } from "@/lib/types";
import { formatBRL, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setCustomerArchivedAction } from "@/actions/customers";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DataList,
  DataListCell,
  DataListHeader,
  DataListRow,
} from "@/components/ui/data-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  usePageAction,
  useShellSearch,
} from "@/components/shell/app-shell-context";
import {
  avatarClass,
  birthdayShort,
  buildUnpaidByCustomer,
  computeStoreAvgTicket,
  daysSinceLastOrder,
  isNewCustomer,
  lastOrderSummary,
  rowOverdueDays,
  tagMeta,
  upcomingBirthdayDays,
  whatsappHref,
} from "./customer-logic";
import { CustomerDetailSheet } from "./customer-detail-sheet";
import { CustomerFormSheet } from "./customer-form-sheet";

type Segment = "todos" | "vip" | "aniversarios" | "areceber" | "arquivados";

const SEGMENTS: {
  key: Segment;
  label: string;
  /** Trigger-button copy, when it differs from the dropdown item label (design Mock Clientes 1a/2a/2b). */
  triggerLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}[] = [
  { key: "todos", label: "Todos", triggerLabel: "Todos os clientes", icon: Users },
  { key: "vip", label: "VIP", icon: Crown, iconClass: "bg-[#F6EAC6] text-[#8A6312]" },
  {
    key: "aniversarios",
    label: "Aniversários",
    triggerLabel: "Aniversários do mês",
    icon: Cake,
    iconClass: "bg-[#F8E9F1] text-[#C2407E]",
  },
  {
    key: "areceber",
    label: "A receber",
    icon: Clock,
    iconClass: "bg-[#FBF1DC] text-amber",
  },
  {
    key: "arquivados",
    label: "Arquivados",
    icon: Archive,
    iconClass: "bg-[#EEF1ED] text-[#7A857D]",
  },
];

function isSegment(v: string | undefined): v is Segment {
  return SEGMENTS.some((s) => s.key === v);
}

export function ClientesClient({
  storeId,
  storeName,
  defaultDDD,
  customers,
  orders = [],
  cartelas = [],
  initialSegment,
}: {
  storeId: string;
  storeName: string;
  defaultDDD?: string;
  customers: Customer[];
  orders?: Order[];
  cartelas?: Cartela[];
  initialSegment?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>(
    isSegment(initialSegment) ? initialSegment : "todos",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const shellSearch = useShellSearch();

  usePageAction({
    label: "Novo cliente",
    onClick: () => {
      setEditing(null);
      setFormOpen(true);
    },
  });

  function pickSegment(next: Segment) {
    setSegment(next);
    // Keep the URL in sync so the segment survives refresh / back-forward and
    // the dashboard deep-link (?seg=aniversarios) stays shareable.
    const qs = next === "todos" ? "" : `?seg=${next}`;
    router.replace(`${pathname}${qs}`, { scroll: false });
  }

  const unpaidByCustomer = useMemo(
    () => buildUnpaidByCustomer(orders),
    [orders],
  );
  const storeAvgTicket = useMemo(
    () => computeStoreAvgTicket(customers),
    [customers],
  );

  // Look up by id so the drawer always shows fresh data after revalidation.
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const selectedOrders = useMemo(
    () => (selectedId ? orders.filter((o) => o.customerId === selectedId) : []),
    [orders, selectedId],
  );
  const selectedCartelas = useMemo(
    () => (selectedId ? cartelas.filter((c) => c.customerId === selectedId) : []),
    [cartelas, selectedId],
  );

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return customers.filter((c) => {
      // Search spans name + @instagram + phone (design custSearch 2938).
      const haystack = `${c.name} ${c.instagram ?? ""} ${c.phone ?? ""}`.toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;

      if (segment === "arquivados") return c.archived;
      if (c.archived) return false;
      if (segment === "vip") return c.tags.includes("vip");
      if (segment === "aniversarios") return upcomingBirthdayDays(c.birthday) != null;
      if (segment === "areceber") return unpaidByCustomer.has(c.id);
      return true;
    })
      // Most-frequent buyers first (design Mock Clientes 1a: "ordenada por
      // recorrência").
      .sort((a, b) => b.orderCount - a.orderCount);
  }, [customers, query, shellSearch, segment, unpaidByCustomer]);

  const activeSeg = SEGMENTS.find((s) => s.key === segment)!;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 min-[560px]:flex-row min-[560px]:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, @ ou telefone…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-[13px] font-semibold transition-colors hover:border-primary/40 data-[state=open]:border-primary/40",
                // A non-default segment reads as an active filter — border and
                // text shift to primary green (design Mock Clientes 2a/2b).
                segment === "todos"
                  ? "border-border text-ink-soft"
                  : "border-primary/30 text-primary",
              )}
            >
              <ListFilter
                className={cn("size-4", segment === "todos" ? "text-leaf" : "text-primary")}
              />
              <span>{activeSeg.triggerLabel ?? activeSeg.label}</span>
              <ChevronDown className="size-3.5 text-ink-faint" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {SEGMENTS.map((s) => (
              <DropdownMenuItem
                key={s.key}
                active={segment === s.key}
                onSelect={() => pickSegment(s.key)}
              >
                <DropdownMenuItemIcon className={s.iconClass}>
                  <s.icon />
                </DropdownMenuItemIcon>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={customers.length === 0 ? "Nenhum cliente ainda" : "Nada encontrado"}
          description={
            customers.length === 0
              ? "Cadastre clientes para acompanhar pedidos, aniversários e recompras."
              : "Tente outra busca ou segmento."
          }
        />
      ) : segment === "aniversarios" ? (
        <AniversariosList customers={filtered} />
      ) : segment === "arquivados" ? (
        <ArquivadosList storeId={storeId} customers={filtered} onOpen={setSelectedId} />
      ) : (
        <>
          {/* Desktop table (design 636-657) */}
          <DataList
            columns="1fr 150px"
            className="hidden min-[820px]:block"
          >
            <DataListHeader>
              <span>Cliente</span>
              <DataListCell align="end">Tags</DataListCell>
            </DataListHeader>
            {filtered.map((customer) => {
              const unpaid = unpaidByCustomer.get(customer.id);
              const bdayDays = upcomingBirthdayDays(customer.birthday);
              const overdueDays = rowOverdueDays(customer);
              return (
                <DataListRow
                  key={customer.id}
                  onClick={() => setSelectedId(customer.id)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                        avatarClass(customer),
                      )}
                    >
                      {initials(customer.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {customer.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-faint">
                        {lastOrderSummary(customer)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {bdayDays != null && <BirthdayChip days={bdayDays} />}
                        {unpaid && (
                          <UnpaidChip total={unpaid.total} />
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    <RowTags customer={customer} overdueDays={overdueDays} />
                  </span>
                </DataListRow>
              );
            })}
          </DataList>

          {/* Mobile cards (design 660-679) */}
          <ul className="space-y-2.5 min-[820px]:hidden">
            {filtered.map((customer) => {
              const unpaid = unpaidByCustomer.get(customer.id);
              const bdayDays = upcomingBirthdayDays(customer.birthday);
              const overdueDays = rowOverdueDays(customer);
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(customer.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                  >
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
                        avatarClass(customer),
                      )}
                    >
                      {initials(customer.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ink">
                          {customer.name}
                        </span>
                        <RowTags customer={customer} overdueDays={overdueDays} />
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                        {lastOrderSummary(customer)}
                      </span>
                      {bdayDays != null && (
                        <span className="mt-1.5 flex">
                          <BirthdayChip days={bdayDays} />
                        </span>
                      )}
                    </span>
                    {unpaid && (
                      <span className="shrink-0">
                        <UnpaidChip total={unpaid.total} compact />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <CustomerDetailSheet
        storeId={storeId}
        customer={selected}
        orders={selectedOrders}
        cartelas={selectedCartelas}
        unpaid={selected ? (unpaidByCustomer.get(selected.id) ?? null) : null}
        storeAvgTicket={storeAvgTicket}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onEdit={(customer) => {
          setEditing(customer);
          setSelectedId(null);
          setFormOpen(true);
        }}
      />

      <CustomerFormSheet
        storeId={storeId}
        storeName={storeName}
        defaultDDD={defaultDDD}
        customer={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}

function RowTags({
  customer,
  overdueDays,
}: {
  customer: Customer;
  overdueDays: number | null;
}) {
  const tags = customer.tags
    .map((id) => tagMeta(id))
    .filter((t): t is NonNullable<typeof t> => t != null);

  // The overdue badge takes the Tags-column slot alongside any manual tags
  // (design Mock Clientes 1a, Luiza Castro row) — it isn't a third under-name
  // badge, birthday/unpaid already fill that slot on their own.
  if (overdueDays == null && tags.length === 0) {
    if (isNewCustomer(customer)) return <NewChip />;
    return <span className="text-[12px] text-ink-faint max-[819px]:hidden">—</span>;
  }
  return (
    <>
      {overdueDays != null && <OverdueChip days={overdueDays} />}
      {tags.map((t) => (
        <span
          key={t.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            t.chipClass,
          )}
        >
          <t.icon className="size-3" />
          {t.label}
        </span>
      ))}
    </>
  );
}

function OverdueChip({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBEAE4] px-2.5 py-0.5 text-[11px] font-bold text-[#A83D22]">
      <span className="size-1.5 rounded-full bg-[#C0492B]" />
      Atraso {days}d
    </span>
  );
}

function NewChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E6EFF8] px-2.5 py-0.5 text-[11px] font-bold text-[#2F6FB5]">
      <Sparkles className="size-3" />
      Novo
    </span>
  );
}

function BirthdayChip({ days }: { days: number }) {
  // "Faz aniversário {hoje|amanhã|em N dias}" (design Mock Clientes 1a) — no
  // date in the chip itself; the date shows in the Aniversários segment and
  // the detail sheet's contact row.
  const suffix = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F8E9F1] px-2.5 py-0.5 text-[11px] font-bold text-[#C2407E]">
      <Cake className="size-3" />
      Faz aniversário {suffix}
    </span>
  );
}

function UnpaidChip({ total, compact }: { total: number; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF1DC] px-2.5 py-0.5 text-[11px] font-bold text-amber">
      <Clock className="size-3" />
      {compact ? formatBRL(total) : `A receber ${formatBRL(total)}`}
    </span>
  );
}

/**
 * Aniversários segment: a flat list of rounded cards, not the generic table —
 * date + tags + order count instead of last-order recency, and a per-row
 * "Enviar mensagem" WhatsApp action (design Mock Clientes 2a).
 */
function AniversariosList({ customers }: { customers: Customer[] }) {
  return (
    <ul className="space-y-2.5">
      {customers.map((customer) => {
        const tags = customer.tags
          .map((id) => tagMeta(id))
          .filter((t): t is NonNullable<typeof t> => t != null);
        const parts = [
          birthdayShort(customer.birthday),
          ...tags.map((t) => t.label),
          customer.orderCount === 1 ? "1 pedido" : `${customer.orderCount} pedidos`,
        ].filter(Boolean);
        const wa = whatsappHref(customer.phone);
        return (
          <li
            key={customer.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold",
                avatarClass(customer),
              )}
            >
              {initials(customer.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold text-ink">
                {customer.name}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                {parts.join(" · ")}
              </span>
            </span>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-[10px] bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Enviar mensagem
              </a>
            ) : (
              <span className="shrink-0 rounded-[10px] border border-border px-3.5 py-2 text-[12.5px] font-semibold text-ink-faint">
                Sem telefone
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Arquivados segment: Cliente / Situação table — "Sem pedidos há {N}d" (plus
 * the customer's own note as the archive reason, there's no dedicated reason
 * field) instead of the usual recency line, and a "Reativar" action in place
 * of tag chips (design Mock Clientes 2b).
 */
function ArquivadosList({
  storeId,
  customers,
  onOpen,
}: {
  storeId: string;
  customers: Customer[];
  onOpen: (id: string) => void;
}) {
  return (
    <DataList columns="1fr 190px">
      <DataListHeader>
        <span>Cliente</span>
        <DataListCell align="end">Situação</DataListCell>
      </DataListHeader>
      {customers.map((customer) => (
        <ArquivadoRow
          key={customer.id}
          storeId={storeId}
          customer={customer}
          onOpen={onOpen}
        />
      ))}
    </DataList>
  );
}

function ArquivadoRow({
  storeId,
  customer,
  onOpen,
}: {
  storeId: string;
  customer: Customer;
  onOpen: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const days = daysSinceLastOrder(customer.lastOrderAt);
  const recency = days == null ? "Sem pedidos ainda" : `Sem pedidos há ${days}d`;

  function reactivate() {
    startTransition(async () => {
      const result = await setCustomerArchivedAction(storeId, customer.id, false);
      if (result.ok) {
        toast.success("Cliente reativado.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <DataListRow onClick={() => onOpen(customer.id)} className="opacity-70">
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
            avatarClass(customer),
          )}
        >
          {initials(customer.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-ink">
            {customer.name}
          </span>
          <span className="block truncate text-[11.5px] text-ink-faint">
            {recency}
            {customer.notes ? ` · ${customer.notes}` : ""}
          </span>
        </span>
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1ED] px-2.5 py-0.5 text-[11px] font-bold text-[#7A857D]">
          <Archive className="size-3" />
          Arquivado
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            reactivate();
          }}
          className="text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-50"
        >
          Reativar
        </button>
      </span>
    </DataListRow>
  );
}
