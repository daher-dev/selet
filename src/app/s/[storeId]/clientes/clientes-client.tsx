"use client";

import { useMemo, useState } from "react";
import { Crown, MapPin, Phone, Plus, Search, Users } from "lucide-react";
import type { Customer, Order } from "@/lib/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { CustomerDetailSheet } from "./customer-detail-sheet";
import { CustomerFormSheet } from "./customer-form-sheet";

type Segment = "ativos" | "vip" | "arquivados";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "ativos", label: "Ativos" },
  { key: "vip", label: "VIP" },
  { key: "arquivados", label: "Arquivados" },
];

export function ClientesClient({
  storeId,
  customers,
  orders = [],
}: {
  storeId: string;
  customers: Customer[];
  orders?: Order[];
}) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("ativos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  // Look up by id so the drawer always shows fresh data after revalidation.
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  // The selected customer's orders (newest-first, as listOrders returns them).
  const selectedOrders = useMemo(
    () => (selectedId ? orders.filter((o) => o.customerId === selectedId) : []),
    [orders, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (segment === "arquivados" ? !c.archived : c.archived) return false;
      if (segment === "vip" && !c.tags.includes("vip")) return false;
      return !q || c.name.toLowerCase().includes(q);
    });
  }, [customers, query, segment]);

  const activeCount = customers.filter((c) => !c.archived).length;

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${activeCount} ${activeCount === 1 ? "cliente ativo" : "clientes ativos"}`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="gap-1.5 rounded-xl font-semibold"
          >
            <Plus className="size-4" />
            Novo cliente
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                segment === s.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-ink-soft hover:border-primary/40",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
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
        <ul className="space-y-2.5">
          {filtered.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => setSelectedId(customer.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold",
                    customer.tags.includes("vip")
                      ? "bg-amber-wash text-amber"
                      : "bg-mist text-primary",
                  )}
                >
                  {initials(customer.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-ink">
                      {customer.name}
                    </span>
                    {customer.tags.includes("vip") && (
                      <Crown className="size-3.5 shrink-0 text-amber" />
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-3 text-[11.5px] text-ink-faint">
                    {customer.city && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="size-3" />
                        {customer.city}
                      </span>
                    )}
                    {customer.phone && (
                      <span className="flex items-center gap-1 truncate">
                        <Phone className="size-3" />
                        {customer.phone}
                      </span>
                    )}
                  </span>
                </span>
                {customer.orderCount > 0 && (
                  <span className="tabular shrink-0 text-[11.5px] font-semibold text-ink-soft">
                    {customer.orderCount}{" "}
                    {customer.orderCount === 1 ? "pedido" : "pedidos"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <CustomerDetailSheet
        storeId={storeId}
        customer={selected}
        orders={selectedOrders}
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
        customer={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}
