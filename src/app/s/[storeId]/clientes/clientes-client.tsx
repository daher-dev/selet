"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Cake,
  ChevronDown,
  Clock,
  Crown,
  ListFilter,
  Search,
  Users,
} from "lucide-react";
import type { Customer, Order } from "@/lib/types";
import { formatBRL, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  buildUnpaidByCustomer,
  daysToBirthday,
  lastOrderLabel,
  tagMeta,
} from "./customer-logic";
import { CustomerDetailSheet } from "./customer-detail-sheet";
import { CustomerFormSheet } from "./customer-form-sheet";

type Segment = "todos" | "vip" | "aniversarios" | "areceber" | "arquivados";

const SEGMENTS: {
  key: Segment;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}[] = [
  { key: "todos", label: "Todos", icon: Users },
  { key: "vip", label: "VIP", icon: Crown, iconClass: "bg-[#F6EAC6] text-[#8A6312]" },
  {
    key: "aniversarios",
    label: "Aniversários",
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
  customers,
  orders = [],
  initialSegment,
}: {
  storeId: string;
  storeName: string;
  customers: Customer[];
  orders?: Order[];
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

  // Look up by id so the drawer always shows fresh data after revalidation.
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const selectedOrders = useMemo(
    () => (selectedId ? orders.filter((o) => o.customerId === selectedId) : []),
    [orders, selectedId],
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
      if (segment === "aniversarios") {
        const d = daysToBirthday(c.birthday);
        return d != null && d <= 30;
      }
      if (segment === "areceber") return unpaidByCustomer.has(c.id);
      return true;
    });
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
              className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-primary/40 data-[state=open]:border-primary/40"
            >
              <ListFilter className="size-4 text-leaf" />
              <span>{activeSeg.label}</span>
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
              const bdayDays =
                segment === "aniversarios"
                  ? daysToBirthday(customer.birthday)
                  : null;
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
                        {lastOrderLabel(customer.lastOrderAt)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {bdayDays != null && (
                          <BirthdayChip birthday={customer.birthday} days={bdayDays} />
                        )}
                        {unpaid && (
                          <UnpaidChip total={unpaid.total} />
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    <RowTags customer={customer} />
                  </span>
                </DataListRow>
              );
            })}
          </DataList>

          {/* Mobile cards (design 660-679) */}
          <ul className="space-y-2.5 min-[820px]:hidden">
            {filtered.map((customer) => {
              const unpaid = unpaidByCustomer.get(customer.id);
              const bdayDays =
                segment === "aniversarios"
                  ? daysToBirthday(customer.birthday)
                  : null;
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
                        <RowTags customer={customer} />
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                        {lastOrderLabel(customer.lastOrderAt)}
                      </span>
                      {bdayDays != null && (
                        <span className="mt-1.5 flex">
                          <BirthdayChip birthday={customer.birthday} days={bdayDays} />
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
        unpaid={selected ? (unpaidByCustomer.get(selected.id) ?? null) : null}
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
        customer={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}

function RowTags({ customer }: { customer: Customer }) {
  const tags = customer.tags
    .map((id) => tagMeta(id))
    .filter((t): t is NonNullable<typeof t> => t != null);
  if (tags.length === 0) {
    return <span className="text-[12px] text-ink-faint max-[819px]:hidden">—</span>;
  }
  return (
    <>
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

function BirthdayChip({
  birthday,
  days,
}: {
  birthday: Customer["birthday"];
  days: number;
}) {
  const suffix = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
  const dm = birthday
    ? `${String(birthday.day).padStart(2, "0")}/${String(birthday.month).padStart(2, "0")}`
    : "";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F8E9F1] px-2.5 py-0.5 text-[11px] font-bold text-[#C2407E]">
      <Cake className="size-3" />
      {dm} · {suffix}
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
