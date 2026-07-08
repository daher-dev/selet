"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Plus, Search, ShoppingBag } from "lucide-react";
import type { Customer, Order, Product } from "@/lib/types";
import { formatBRL, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
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

type StatusFilter = "todos" | Order["status"];

// OrderItem doesn't carry a category — we resolve it from the live catalog and
// fall back to a neutral tile for items whose product is gone/unknown.
const NEUTRAL_TILE: CategoryMeta = {
  label: "Item",
  icon: ShoppingBag,
  fg: "text-ink-soft",
  bg: "bg-mist",
};

// Chips shown inline on a card before collapsing the rest into a "+N".
const MAX_ITEM_CHIPS = 4;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "novo", label: "Novos" },
  { key: "preparando", label: "Preparando" },
  { key: "entrega", label: "Entrega" },
  { key: "concluido", label: "Concluídos" },
  { key: "cancelado", label: "Cancelados" },
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const shellSearch = useShellSearch();

  usePageAction({ label: "Novo pedido", onClick: () => setCreating(true) });

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  // productId → category, so we can color each item chip on the cards.
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
      if (statusFilter !== "todos" && o.status !== statusFilter) return false;
      if (onlyUnpaid && (o.paid || o.status === "cancelado")) return false;
      return terms.every((term) => matches(o, term));
    });
  }, [orders, query, shellSearch, statusFilter, onlyUnpaid]);

  return (
    <>

      {receivables.length > 0 && (
        <button
          type="button"
          onClick={() => setOnlyUnpaid(!onlyUnpaid)}
          className={cn(
            "mb-4 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
            onlyUnpaid
              ? "border-amber bg-amber-wash"
              : "border-amber/40 bg-amber-wash/60 hover:border-amber",
          )}
        >
          <AlertCircle className="size-4.5 shrink-0 text-amber" />
          <span className="flex-1 text-[13px] text-ink-soft">
            <strong className="font-bold text-ink">
              {formatBRL(receivablesTotal)} a receber
            </strong>{" "}
            em {receivables.length}{" "}
            {receivables.length === 1 ? "pedido" : "pedidos"}
          </span>
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-amber">
            {onlyUnpaid ? "Ver todos" : "Filtrar"}
          </span>
        </button>
      )}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código, cliente ou item…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                statusFilter === f.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-ink-soft hover:border-primary/40",
              )}
            >
              {f.label}
            </button>
          ))}
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
        <ul className="space-y-2.5">
          {filtered.map((order) => {
            const channel = CHANNEL_META[order.channel];
            const status = STATUS_META[order.status];
            const showAllItems = order.items.length <= MAX_ITEM_CHIPS;
            const visibleItems = showAllItems
              ? order.items
              : order.items.slice(0, MAX_ITEM_CHIPS - 1);
            const hiddenItems = order.items.length - visibleItems.length;
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  className="w-full rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] font-semibold text-ink-faint">
                      #{order.code}
                    </span>
                    <span className={cn("size-1.5 rounded-full", channel.dot)} />
                    <span className="text-[11px] text-ink-faint">
                      {channel.label}
                    </span>
                    <span className="ml-auto text-[11px] text-ink-faint">
                      {formatRelative(order.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                      {order.customerName}
                    </span>
                    <span className="tabular shrink-0 text-[14px] font-bold text-ink">
                      {formatBRL(order.total)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {visibleItems.map((item, i) => {
                      const meta =
                        PRODUCT_CATEGORY_META[
                          categoryById.get(item.productId) ?? ""
                        ] ?? NEUTRAL_TILE;
                      return (
                        <span
                          key={`${item.productId}-${i}`}
                          className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-paper py-1 pl-1 pr-2.5"
                        >
                          <CategoryTile meta={meta} className="size-7 rounded-lg" />
                          <span className="min-w-0 truncate text-[12px] text-ink-soft">
                            <strong className="font-bold text-primary">
                              {item.qty}
                            </strong>{" "}
                            {item.name}
                          </span>
                        </span>
                      );
                    })}
                    {hiddenItems > 0 && (
                      <span className="self-center px-1 text-[11.5px] font-semibold text-ink-faint">
                        +{hiddenItems}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                        status.bg,
                        status.fg,
                      )}
                    >
                      {status.label}
                    </span>
                    {order.status !== "cancelado" && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                          order.paid
                            ? "bg-mint-wash text-primary"
                            : "bg-amber-wash text-amber",
                        )}
                      >
                        {order.paid ? "Pago" : "A pagar"}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
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
