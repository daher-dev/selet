"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  ChefHat,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Filter,
  Inbox,
  List,
  MessageCircle,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import type { Customer, Order, OrderChannel, Product } from "@/lib/types";
import { formatBRL, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DataList,
  DataListCell,
  DataListHeader,
  DataListRow,
} from "@/components/ui/data-list";
import {
  usePageAction,
  useShellSearch,
} from "@/components/shell/app-shell-context";
import { CHANNEL_META, STATUS_META } from "@/components/order-meta";
import {
  CategoryTile,
  PRODUCT_CATEGORY_META,
  type CategoryMeta,
} from "@/components/category-meta";
import { OrderSheet } from "./order-sheet";

type ChannelFilter = "todos" | OrderChannel;
type StatusFilter = "todos" | Order["status"];
type PayFilter = "todos" | "pago" | "pendente";

// OrderItem doesn't carry a category — we resolve it from the live catalog and
// fall back to a neutral tile for items whose product is gone/unknown.
const NEUTRAL_TILE: CategoryMeta = {
  label: "Item",
  icon: ShoppingBag,
  fg: "text-ink-soft",
  bg: "bg-mist",
};

// Chips shown inline before collapsing the rest into a "+N".
const MAX_ITEM_CHIPS = 4;

// A filter option: value + label + a coloured icon tile (design's dropdown
// filters render an icon chip + label + a check on the active row).
interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  tile: string; // tile bg + fg classes
}

const CHANNEL_OPTIONS: FilterOption<ChannelFilter>[] = [
  { value: "todos", label: "Todos os canais", icon: List, tile: "bg-mist text-ink-soft" },
  { value: "instagram", label: "Instagram", icon: AtSign, tile: "bg-channel-instagram/10 text-channel-instagram" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle, tile: "bg-channel-whatsapp/10 text-channel-whatsapp" },
  { value: "loja", label: "Loja física", icon: Store, tile: "bg-channel-loja/15 text-ink-soft" },
];

const STATUS_OPTIONS: FilterOption<StatusFilter>[] = [
  { value: "todos", label: "Todos", icon: List, tile: "bg-mist text-ink-soft" },
  { value: "novo", label: "Novo", icon: Inbox, tile: "bg-info-wash text-info" },
  { value: "preparando", label: "Preparando", icon: ChefHat, tile: "bg-amber-wash text-amber" },
  { value: "entrega", label: "Saiu p/ entrega", icon: Truck, tile: "bg-cat-bebidas-wash text-cat-bebidas" },
  { value: "concluido", label: "Concluído", icon: CircleCheck, tile: "bg-mint-wash text-primary" },
  { value: "cancelado", label: "Cancelado", icon: CircleX, tile: "bg-danger-wash text-destructive" },
];

const PAY_OPTIONS: FilterOption<PayFilter>[] = [
  { value: "todos", label: "Todos", icon: Wallet, tile: "bg-mist text-ink-soft" },
  { value: "pago", label: "Pagos", icon: CircleCheck, tile: "bg-mint-wash text-primary" },
  { value: "pendente", label: "A receber", icon: Clock, tile: "bg-amber-wash text-amber" },
];

interface PedidosClientProps {
  storeId: string;
  orders: Order[];
  customers: Customer[];
  products: Product[];
}

export function PedidosClient({
  storeId,
  orders,
  customers,
  products,
}: PedidosClientProps) {
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [payFilter, setPayFilter] = useState<PayFilter>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const shellSearch = useShellSearch();

  usePageAction({ label: "Novo pedido", onClick: () => setCreating(true) });

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  // productId → category, so we can color each item chip on the rows.
  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.category);
    return map;
  }, [products]);

  const receivables = useMemo(
    () => orders.filter((o) => !o.paid && o.status !== "cancelado"),
    [orders],
  );
  const receivablesTotal = receivables.reduce((s, o) => s + o.total, 0);

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const matches = (o: Order, term: string) =>
      o.code.toLowerCase().includes(term) ||
      o.customerName.toLowerCase().includes(term) ||
      o.items.some((i) => i.name.toLowerCase().includes(term));
    return orders.filter((o) => {
      if (channelFilter !== "todos" && o.channel !== channelFilter) return false;
      if (statusFilter !== "todos" && o.status !== statusFilter) return false;
      if (payFilter === "pago" && (!o.paid || o.status === "cancelado")) return false;
      if (payFilter === "pendente" && (o.paid || o.status === "cancelado"))
        return false;
      return terms.every((term) => matches(o, term));
    });
  }, [orders, query, shellSearch, channelFilter, statusFilter, payFilter]);

  // An order's item chips, capped at MAX_ITEM_CHIPS with a trailing "+N".
  function itemChips(order: Order) {
    const showAll = order.items.length <= MAX_ITEM_CHIPS;
    const visible = showAll
      ? order.items
      : order.items.slice(0, MAX_ITEM_CHIPS - 1);
    const hidden = order.items.length - visible.length;
    return { visible, hidden };
  }

  function tileMeta(productId: string): CategoryMeta {
    return PRODUCT_CATEGORY_META[categoryById.get(productId) ?? ""] ?? NEUTRAL_TILE;
  }

  return (
    <>
      {receivables.length > 0 && (
        <button
          type="button"
          onClick={() =>
            setPayFilter(payFilter === "pendente" ? "todos" : "pendente")
          }
          className={cn(
            "mb-4 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
            payFilter === "pendente"
              ? "border-amber bg-amber-wash"
              : "border-amber/40 bg-amber-wash/60 hover:border-amber",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber">
            <Wallet className="size-4.5" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-amber">
              A receber
            </span>
            <span className="block text-[15px] font-bold text-ink">
              {formatBRL(receivablesTotal)}{" "}
              <span className="text-[12px] font-medium text-ink-faint">
                · {receivables.length}{" "}
                {receivables.length === 1
                  ? "pedido em aberto"
                  : "pedidos em aberto"}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-amber">
            {payFilter === "pendente" ? "Ver todos" : "Ver"}
            <ChevronDown className="size-4 -rotate-90" />
          </span>
        </button>
      )}

      <div className="mb-4 flex flex-col gap-3 min-[820px]:flex-row min-[820px]:items-center">
        <div className="relative min-[820px]:max-w-xs min-[820px]:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nº, cliente ou item…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto min-[820px]:ml-auto min-[820px]:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterDropdown
            prefix="Canal"
            options={CHANNEL_OPTIONS}
            value={channelFilter}
            onChange={setChannelFilter}
          />
          <FilterDropdown
            prefix="Status"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterDropdown
            prefix="Pagamento"
            options={PAY_OPTIONS}
            value={payFilter}
            onChange={setPayFilter}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={orders.length === 0 ? "Nenhum pedido ainda" : "Nada encontrado"}
          description={
            orders.length === 0
              ? "Registre os pedidos que chegam por Instagram, WhatsApp e na loja."
              : "Tente outra busca ou filtro."
          }
          action={
            orders.length === 0 ? (
              <Button
                onClick={() => setCreating(true)}
                className="gap-1.5 rounded-xl font-semibold"
              >
                <Plus className="size-4" />
                Novo pedido
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop: responsive data table (design lines 296-329). */}
          <DataList
            columns="60px 1.4fr 1.3fr 96px 108px 148px"
            className="hidden min-[820px]:block"
          >
            <DataListHeader>
              <span>Pedido</span>
              <span>Cliente</span>
              <span>Itens</span>
              <span>Canal</span>
              <span>Status</span>
              <DataListCell align="end">Total</DataListCell>
            </DataListHeader>
            {filtered.map((order) => {
              const { visible, hidden } = itemChips(order);
              const unpaid = !order.paid && order.status !== "cancelado";
              return (
                <DataListRow
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                >
                  <span className="font-mono text-[12px] font-semibold text-ink-faint">
                    #{order.code}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {order.customerName}
                    </span>
                    <span className="block text-[11.5px] text-ink-faint">
                      {formatRelative(order.createdAt)}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {visible.map((item, i) => (
                      <span
                        key={`${item.productId}-${i}`}
                        title={item.name}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-paper py-0.5 pl-0.5 pr-2.5"
                      >
                        <CategoryTile
                          meta={tileMeta(item.productId)}
                          className="size-6 rounded-lg"
                        />
                        <span className="tabular text-[12px] font-bold text-ink-soft">
                          {item.qty}
                        </span>
                      </span>
                    ))}
                    {hidden > 0 && (
                      <span className="shrink-0 text-[11px] font-semibold text-ink-faint">
                        +{hidden}
                      </span>
                    )}
                  </span>
                  <span>
                    <ChannelBadge channel={order.channel} />
                  </span>
                  <span>
                    <StatusBadge status={order.status} />
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    {unpaid && <ReceberChip />}
                    <span className="tabular text-[14px] font-bold text-ink">
                      {formatBRL(order.total)}
                    </span>
                  </span>
                </DataListRow>
              );
            })}
          </DataList>

          {/* Mobile: card stack (design lines 330-364). */}
          <ul className="space-y-3 min-[820px]:hidden">
            {filtered.map((order) => {
              const { visible, hidden } = itemChips(order);
              const unpaid = !order.paid && order.status !== "cancelado";
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold text-ink-faint">
                        #{order.code}
                      </span>
                      <ChannelBadge channel={order.channel} />
                      <span className="flex-1" />
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="mt-2.5 text-[15px] font-semibold text-ink">
                      {order.customerName}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {visible.map((item, i) => (
                        <span
                          key={`${item.productId}-${i}`}
                          className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-paper py-1 pl-1 pr-2.5"
                        >
                          <CategoryTile
                            meta={tileMeta(item.productId)}
                            className="size-7 rounded-lg"
                          />
                          <span className="min-w-0 truncate text-[12px] text-ink-soft">
                            <strong className="font-bold text-primary">
                              {item.qty}
                            </strong>{" "}
                            {item.name}
                          </span>
                        </span>
                      ))}
                      {hidden > 0 && (
                        <span className="self-center px-1 text-[11.5px] font-semibold text-ink-faint">
                          +{hidden}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between border-t border-muted pt-3">
                      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                        <Clock className="size-3" />
                        {formatRelative(order.createdAt)}
                      </span>
                      <span className="flex items-center gap-2">
                        {unpaid && <ReceberChip />}
                        <span className="tabular text-[19px] font-bold text-ink">
                          {formatBRL(order.total)}
                        </span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <OrderSheet
        storeId={storeId}
        order={creating ? null : selected}
        customers={customers}
        products={products}
        open={creating || selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setSelectedId(null);
          }
        }}
      />
    </>
  );
}

// Channel pill (dot + label), design's inline channel badge.
function ChannelBadge({ channel }: { channel: OrderChannel }) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        meta.bg,
        meta.fg,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-bold",
        meta.bg,
        meta.fg,
      )}
    >
      {meta.label}
    </span>
  );
}

// Amber "A receber" clock chip — shown only on unpaid rows (design 322/356).
function ReceberChip() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-wash px-2 py-0.5 text-[10.5px] font-bold text-amber">
      <Clock className="size-3" strokeWidth={2.2} />
      A receber
    </span>
  );
}

// One of the three toolbar filter dropdowns (Canal / Status / Pagamento):
// an icon+check menu (design lines 229-282), replacing the old pill row.
function FilterDropdown<T extends string>({
  prefix,
  options,
  value,
  onChange,
}: {
  prefix: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-ink-soft transition-colors hover:-translate-y-px hover:border-primary/40 data-[state=open]:border-primary/40"
        >
          <Filter className="size-3.5 text-leaf" />
          <span>
            {prefix}
            <span className="text-ink-faint">: {active?.label ?? ""}</span>
          </span>
          <ChevronDown className="size-3.5 text-ink-faint transition-transform data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <DropdownMenuItem
              key={o.value}
              active={value === o.value}
              onSelect={() => onChange(o.value)}
            >
              <DropdownMenuItemIcon className={o.tile}>
                <Icon />
              </DropdownMenuItemIcon>
              <span className="flex-1">{o.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
