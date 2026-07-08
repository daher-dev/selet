"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Cake,
  RefreshCcw,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import type { Order, StockItem } from "@/lib/types";
import { formatBRL, formatQty, formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePageAction } from "@/components/shell/app-shell-context";
import { CHANNEL_META, STATUS_META } from "@/components/order-meta";
import { ChannelDonut } from "@/components/charts/channel-donut";

interface DashboardClientProps {
  storeId: string;
  kpis: {
    activeCustomers: number;
    newCustomers30d: number;
    monthOrders: number;
    monthRevenue: number;
    birthdays: number;
  };
  byChannel: { instagram: number; whatsapp: number; loja: number };
  topSellers: { name: string; qty: number; revenue: number }[];
  lowStock: StockItem[];
  recentOrders: Order[];
  upcomingBirthdays: { id: string; name: string; inDays: number }[];
  reorderDue: { id: string; name: string; inDays: number }[];
}

export function DashboardClient({
  storeId,
  kpis,
  byChannel,
  topSellers,
  lowStock,
  recentOrders,
  upcomingBirthdays,
  reorderDue,
}: DashboardClientProps) {
  const maxSellerQty = Math.max(1, ...topSellers.map((s) => s.qty));
  const base = `/s/${storeId}`;

  // Dashboard has no contextual add (design hides it on dashboard/financeiro).
  usePageAction(null);

  return (
    <>
      {/* KPI grid */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Kpi
          icon={Users}
          label="Clientes ativos"
          value={String(kpis.activeCustomers)}
          caption="na sua base"
        />
        <Kpi
          icon={Sparkles}
          label="Novos (30 dias)"
          value={String(kpis.newCustomers30d)}
          caption="últimos 30 dias"
        />
        <Kpi
          icon={ShoppingBag}
          label="Pedidos no mês"
          value={String(kpis.monthOrders)}
          caption={`${formatBRL(kpis.monthRevenue)} · este mês`}
        />
        <Kpi
          icon={Cake}
          label="Aniversários"
          value={String(kpis.birthdays)}
          caption="próximos 30 dias · ver clientes"
          href={`${base}/clientes`}
        />
      </div>

      <div className="mb-4 grid gap-2.5 lg:grid-cols-2">
        {/* Channel donut */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-1 text-[13px] font-bold text-ink">
            Pedidos por canal{" "}
            <span className="font-medium text-ink-faint">· este mês</span>
          </h3>
          <ChannelDonut byChannel={byChannel} />
        </div>

        {/* Top sellers */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-[13px] font-bold text-ink">
            Mais vendidos{" "}
            <span className="font-medium text-ink-faint">· este mês</span>
          </h3>
          {topSellers.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-faint">
              Sem vendas neste mês ainda.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {topSellers.map((seller) => (
                <li key={seller.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="truncate font-semibold text-ink">
                      {seller.name}
                    </span>
                    <span className="tabular shrink-0 text-ink-faint">
                      {seller.qty}× · {formatBRL(seller.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-wash">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(seller.qty / maxSellerQty) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-ink">Pedidos recentes</h3>
            <Link
              href={`${base}/pedidos`}
              className="text-[11px] font-bold uppercase tracking-wide text-primary"
            >
              Ver todos
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-faint">
              Nenhum pedido neste mês.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentOrders.map((order) => {
                const status = STATUS_META[order.status];
                const channel = CHANNEL_META[order.channel];
                return (
                  <li
                    key={order.id}
                    className="flex items-center gap-2.5 text-[12.5px]"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", channel.dot)} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {order.customerName}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        status.bg,
                        status.fg,
                      )}
                    >
                      {status.label}
                    </span>
                    <span className="tabular shrink-0 font-bold text-ink">
                      {formatBRL(order.total)}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {formatRelative(order.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Relationship: birthdays + reorder due */}
        <div className="space-y-2.5">
          {upcomingBirthdays.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <Cake className="size-4 text-channel-instagram" />
                Aniversários chegando
              </h3>
              <ul className="space-y-2">
                {upcomingBirthdays.map((b) => (
                  <li key={b.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="flex size-7 items-center justify-center rounded-full bg-mist text-[10px] font-bold text-primary">
                      {initials(b.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {b.name}
                    </span>
                    <span className="shrink-0 text-ink-faint">
                      {b.inDays === 0
                        ? "hoje 🎉"
                        : b.inDays === 1
                          ? "amanhã"
                          : `em ${b.inDays} dias`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reorderDue.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <RefreshCcw className="size-4 text-primary" />
                Hora de recomprar
              </h3>
              <ul className="space-y-2">
                {reorderDue.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="flex size-7 items-center justify-center rounded-full bg-mist text-[10px] font-bold text-primary">
                      {initials(r.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {r.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0",
                        r.inDays < 0 ? "font-semibold text-amber" : "text-ink-faint",
                      )}
                    >
                      {r.inDays < 0
                        ? `${Math.abs(r.inDays)} dias atrasado`
                        : r.inDays === 0
                          ? "hoje"
                          : `em ${r.inDays} dias`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Low stock — status-dot chip grid (bottom of page) */}
      {lowStock.length > 0 && (
        <Link
          href={`${base}/estoque`}
          className="mt-4 block rounded-2xl border border-amber/40 bg-amber-wash p-4"
        >
          <div className="mb-3 flex items-center gap-2.5">
            <AlertTriangle className="size-4 text-amber" />
            <h3 className="text-[13px] font-bold text-ink">Estoque baixo</h3>
            <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-amber">
              Ver estoque
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {lowStock.map((item) => {
              const out = item.qty <= 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-xl border border-amber/40 bg-card px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      out ? "bg-destructive" : "bg-amber",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="tabular block text-[11px] font-semibold text-amber">
                      {out
                        ? "Esgotado"
                        : `${formatQty(item.qty, item.unit)} em estoque · repor em ${formatQty(item.reorderAt, item.unit)}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </Link>
      )}
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  caption,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  caption?: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
        <Icon className="size-3.5 text-primary" />
        {label}
      </span>
      <p className="tabular mt-1 text-[28px] font-bold leading-none tracking-[-0.4px] text-ink">
        {value}
      </p>
      {caption && <p className="mt-1 text-[11px] text-ink-faint">{caption}</p>}
    </>
  );
  const base = "rounded-2xl border border-border bg-card p-3.5";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, "block transition-colors hover:border-primary/40")}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
