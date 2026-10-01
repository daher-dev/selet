"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Cake,
  ChartPie,
  CircleDollarSign,
  Package,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageAction } from "@/components/shell/app-shell-context";
import { SectionHeading, TintedCard, TONES, type Tone } from "@/components/tinted-card";
import {
  ChannelStackChart,
  CustomerSplitChart,
  MonthlySalesChart,
} from "@/components/charts/evolution-charts";
import type { RankedItem } from "@/lib/dashboard-core";
import type { DashboardView } from "./dashboard-data";

export function DashboardClient({
  storeId,
  view,
}: {
  storeId: string;
  view: DashboardView;
}) {
  const base = `/s/${storeId}`;
  const router = useRouter();

  // "Novo pedido" jumps to Pedidos and auto-opens the create sheet there
  // (the creation form's state — products, customers, shake options — lives
  // in PedidosClient, not here).
  usePageAction({
    label: "Novo pedido",
    onClick: () => router.push(`${base}/pedidos?novo=1`),
  });

  const { kpis, topProducts, topFlavors, months } = view;
  const kpiCards: {
    key: string;
    label: string;
    value: number | null;
    tone: Tone;
    icon: LucideIcon;
    href: string;
  }[] = [
    { key: "clientes", label: "Clientes ativos", value: kpis.activeCustomers, tone: "green", icon: Users, href: `${base}/clientes` },
    { key: "pedidos", label: "Pedidos", value: kpis.orders, tone: "blue", icon: ShoppingBag, href: `${base}/pedidos` },
    { key: "aniversarios", label: "Aniversários próximos", value: kpis.birthdays, tone: "pink", icon: Cake, href: `${base}/clientes?seg=aniversarios` },
    { key: "estoque", label: "Estoque baixo", value: kpis.lowStock, tone: "amber", icon: Package, href: `${base}/estoque` },
  ];
  const visibleKpis = kpiCards.filter((k) => k.value !== null);

  return (
    <>
      <SectionHeading title="Resumo" chip="Últimos 30 dias" />
      {visibleKpis.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
          {visibleKpis.map(({ key, ...k }) => (
            <KpiCard key={key} {...k} value={k.value ?? 0} />
          ))}
        </div>
      )}

      {topProducts && topFlavors && (
        <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-4">
          <TintedCard
            tone="amber"
            icon={Trophy}
            iconBg="#D9A21B"
            title="Top produtos"
            caps
            bodyClassName="px-3.5 pt-3 pb-3.5"
          >
            <Ranking items={topProducts} barColor="#E9BE4A" empty="Sem vendas nos últimos 30 dias." />
          </TintedCard>
          <TintedCard
            tone="pink"
            icon={Sparkles}
            title="Top sabores"
            caps
            bodyClassName="px-3.5 pt-3 pb-3.5"
          >
            <Ranking
              items={topFlavors}
              barColor="#D98AB0"
              empty="Nenhum shake ou pudim nos últimos 30 dias."
            />
          </TintedCard>
        </div>
      )}

      {months && (
        <>
          <div className="mt-[34px] mb-7 h-px bg-[#E1EADC]" />
          <SectionHeading title="Evolução mensal" chip="Últimos 12 meses" />
          <TintedCard
            tone="green"
            icon={CircleDollarSign}
            title="Vendas"
            subtitle="Faturamento mensal em R$ mil"
            className="mb-2.5 lg:mb-4"
          >
            <MonthlySalesChart months={months} />
          </TintedCard>
          <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-4">
            <TintedCard tone="pink" icon={ChartPie} title="Canais de venda">
              <ChannelStackChart months={months} />
            </TintedCard>
            <TintedCard tone="blue" icon={Users} title="Clientes ativos">
              <CustomerSplitChart months={months} />
            </TintedCard>
          </div>
        </>
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  tone,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
  href: string;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className="relative block min-h-[118px] overflow-hidden rounded-2xl border px-4 pt-4 pb-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,0.28)] lg:min-h-[138px] lg:px-5 lg:pt-[18px] lg:pb-5"
      style={{ background: t.wash, borderColor: t.border }}
    >
      <Icon
        aria-hidden
        className="pointer-events-none absolute -right-3.5 -bottom-[18px] size-[92px] opacity-[.16] lg:size-[118px]"
        strokeWidth={1.6}
        style={{ color: t.watermark }}
      />
      <div className="relative flex items-center gap-2.5">
        <span
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] text-white lg:size-[34px]"
          style={{ background: t.solid }}
        >
          <Icon className="size-4 lg:size-[18px]" strokeWidth={2} />
        </span>
        <span
          className="min-w-0 flex-1 text-[12.5px] leading-tight font-bold lg:text-[13px]"
          style={{ color: t.ink }}
        >
          {label}
        </span>
        <span className="-mr-1 hidden size-7 shrink-0 items-center justify-center rounded-lg bg-white/70 sm:flex">
          <ArrowUpRight className="size-4" strokeWidth={2.2} style={{ color: t.ink }} />
        </span>
      </div>
      <p
        className="tabular relative mt-4 text-[44px] leading-none font-bold tracking-[-1.5px] lg:mt-[22px] lg:text-[58px]"
        style={{ color: t.ink }}
      >
        {value}
      </p>
    </Link>
  );
}

const MEDALS = ["#D9A21B", "#8C9A93", "#B9773F"];

function Ranking({
  items,
  barColor,
  empty,
}: {
  items: RankedItem[];
  barColor: string;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-ink-faint">{empty}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.qty));
  return (
    <ol className="flex flex-col gap-0.5">
      {items.map((item, i) => {
        const first = i === 0;
        return (
          <li
            key={item.name}
            className={cn(
              "flex items-center gap-3 rounded-[10px] px-2.5 py-[7px]",
              first && "bg-amber-wash",
            )}
          >
            <span
              className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
              style={
                i < 3
                  ? { background: MEDALS[i], color: "#fff" }
                  : { background: "#EEF2EB", color: "#5C6B62" }
              }
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "mb-[5px] truncate text-[13px] text-ink",
                  first ? "font-bold" : "font-semibold",
                )}
              >
                {item.name}
              </div>
              <div className="h-[5px] overflow-hidden rounded bg-wash">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(item.qty / max) * 100}%`,
                    background: first ? "#D9A21B" : barColor,
                  }}
                />
              </div>
            </div>
            <span className="tabular min-w-[34px] text-right text-[18px] font-bold text-ink">
              {item.qty}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
