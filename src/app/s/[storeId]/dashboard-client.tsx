"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePageAction } from "@/components/shell/app-shell-context";
import { ChannelDonut } from "@/components/charts/channel-donut";

export interface KpiCard {
  label: string;
  value: string;
  sub: string;
  trend?: { text: string; tone: "green" | "blue" | "red" } | null;
  href?: string;
}

interface LowStockChip {
  id: string;
  name: string;
  qty: number;
  unit: string;
}

interface DashboardClientProps {
  storeId: string;
  kpis: KpiCard[];
  byChannel: { instagram: number; whatsapp: number; loja: number };
  topSellers: { name: string; qty: number }[];
  lowStock: LowStockChip[];
  canEstoque: boolean;
}

const TREND_TONE: Record<"green" | "blue" | "red", string> = {
  green: "text-success bg-mint-wash",
  blue: "text-info bg-info-wash",
  red: "text-destructive bg-danger-wash",
};

export function DashboardClient({
  storeId,
  kpis,
  byChannel,
  topSellers,
  lowStock,
  canEstoque,
}: DashboardClientProps) {
  const maxSellerQty = Math.max(1, ...topSellers.map((s) => s.qty));
  const base = `/s/${storeId}`;
  const router = useRouter();

  // "Novo pedido" jumps to Pedidos and auto-opens the create sheet there
  // (the creation form's state — products, customers, shake options — lives
  // in PedidosClient, not here).
  usePageAction({
    label: "Novo pedido",
    onClick: () => router.push(`${base}/pedidos?novo=1`),
  });

  return (
    <>
      {/* KPI grid — 2-up mobile, 4-up desktop */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {kpis.map((kpi) => (
          <Kpi key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Channel donut + top sellers */}
      <div className="mb-4 grid gap-2.5 lg:grid-cols-[1.1fr_0.9fr] lg:gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-[15px] font-semibold text-ink">
            Pedidos por canal
          </h3>
          <p className="mb-3.5 mt-0.5 text-[12.5px] text-ink-faint">
            Distribuição dos pedidos no período
          </p>
          <ChannelDonut byChannel={byChannel} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3.5 text-[15px] font-semibold text-ink">
            Mais vendidos
          </h3>
          {topSellers.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-faint">
              Sem vendas neste período ainda.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {topSellers.map((seller) => (
                <li key={seller.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-semibold text-ink">
                      {seller.name}
                    </span>
                    <span className="tabular shrink-0 text-ink-faint">
                      {seller.qty} un.
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-wash">
                    <div
                      className="h-full rounded-full bg-leaf"
                      style={{ width: `${(seller.qty / maxSellerQty) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Low stock — cream alert with 3-col chip grid, or a green all-clear
          confirmation. Hidden entirely for members without estoque access. */}
      {canEstoque &&
        (lowStock.length > 0 ? (
          <div className="rounded-2xl border border-[#F0E4C8] bg-[#FBF6EC] p-5">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="size-[18px] text-amber" />
                <h3 className="text-[15px] font-bold text-[#8A6312]">
                  Estoque baixo
                </h3>
              </div>
              <Link
                href={`${base}/estoque`}
                className="shrink-0 text-[12.5px] font-semibold text-amber transition-opacity hover:opacity-80"
              >
                Ver estoque →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {lowStock.map((item) => {
                const out = item.qty <= 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-xl border border-[#F0E4C8] bg-card px-3.5 py-3"
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        out ? "bg-destructive" : "bg-amber",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#5C4F2A]">
                        {item.name}
                      </span>
                      <span className="tabular block text-[11.5px] font-semibold text-amber">
                        {out
                          ? "Esgotado"
                          : `${formatQty(item.qty, item.unit)} em estoque`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-[13px] rounded-2xl border border-[#DDEBD5] bg-surface px-5 py-[18px]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-mint-wash text-primary">
              <Check className="size-[18px]" strokeWidth={2.2} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-primary">
                Estoque em ordem
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-soft">
                Nenhum insumo abaixo do mínimo.
              </span>
            </span>
            <Link
              href={`${base}/estoque`}
              className="shrink-0 text-[12.5px] font-semibold text-primary transition-opacity hover:opacity-80"
            >
              Ver estoque →
            </Link>
          </div>
        ))}
    </>
  );
}

function Kpi({ kpi }: { kpi: KpiCard }) {
  const isZero = kpi.value === "0";
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-faint">
          {kpi.label}
        </span>
        {kpi.trend && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              TREND_TONE[kpi.trend.tone],
            )}
          >
            {kpi.trend.text}
          </span>
        )}
      </div>
      <p
        className={cn(
          "tabular mt-2 whitespace-nowrap text-[38px] font-semibold leading-none tracking-[-0.4px]",
          isZero ? "text-ink-faint/70" : "text-ink",
        )}
      >
        {kpi.value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-ink-faint">{kpi.sub}</p>
    </>
  );
  const cardBase =
    "rounded-2xl border border-border bg-card p-[18px] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-[#D6E6CE] hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,0.28)]";
  if (kpi.href) {
    return (
      <Link href={kpi.href} className={cn(cardBase, "block")}>
        {inner}
      </Link>
    );
  }
  return <div className={cardBase}>{inner}</div>;
}
