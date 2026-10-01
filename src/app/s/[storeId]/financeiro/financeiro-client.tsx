"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  ReceiptText,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { FinanceTx } from "@/lib/types";
import type { MonthPoint } from "@/lib/dashboard-core";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePageAction } from "@/components/shell/app-shell-context";
import { SectionHeading, TintedCard } from "@/components/tinted-card";
import { MonthlySalesChart } from "@/components/charts/evolution-charts";
import { EntradaSaidaChart, TicketChart } from "@/components/charts/finance-charts";
import { ManualTxSheet } from "./manual-tx-sheet";
import {
  buildRange,
  competenciaLabel,
  currentMonthKey as getCurrentMonthKey,
  monthKeyOf,
  monthNameOnly,
  txShortMeta,
} from "./finance-shared";
import { TxAmount, TxIcon } from "./tx-visuals";
import { monthBreakdown, type MonthBreakdown } from "./finance-breakdown";
import { useCategoryLabels } from "@/components/finance-settings-context";

interface FinanceiroClientProps {
  storeId: string;
  receivablesByMonth: Record<string, { total: number; count: number }>;
  /** Last 12 months, oldest first (current month last). */
  months: MonthPoint[];
  transactions: FinanceTx[];
}

/**
 * A recent-movement row (design: icon, label, short meta, signed value). Rows
 * are read-only here; editing/deleting lives on Movimentações ("Ver todas").
 */
function MovementRow({ tx }: { tx: FinanceTx }) {
  const categoryLabels = useCategoryLabels();
  return (
    <li className="flex items-center gap-3 border-t border-[#F0F4ED] py-3">
      <TxIcon direction={tx.direction} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-ink">
          {tx.label}
        </span>
        <span className="block truncate text-[11.5px] text-[#A0AC9D]">
          {txShortMeta(tx, categoryLabels)}
        </span>
      </span>
      <TxAmount tx={tx} className="shrink-0 text-[14px]" />
    </li>
  );
}

/** Two-segment split bar + legend rows under Entradas / Saídas in the hero. */
function SplitBreakdown({
  parts,
}: {
  parts: { label: string; value: number; color: string }[];
}) {
  const visible = parts.filter((p) => p.value > 0);
  const total = visible.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return null;
  return (
    <>
      <span className="mt-2.5 flex h-1.5 w-full max-w-[230px] gap-0.5 overflow-hidden rounded">
        {visible.map((p) => (
          <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </span>
      <span className="mt-[9px] flex w-full max-w-[230px] flex-col gap-[5px] text-[12px]">
        {parts
          .filter((p) => p.value > 0 || p.label !== "Outras")
          .map((p) => (
            <span key={p.label} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
              <span className="flex-1 truncate text-white/85">{p.label}</span>
              <span className="tabular font-bold">{formatBRL(p.value)}</span>
            </span>
          ))}
      </span>
    </>
  );
}

function FlowColumn({
  label,
  value,
  icon,
  parts,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  parts: { label: string; value: number; color: string }[];
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex size-[30px] shrink-0 items-center justify-center self-start rounded-lg bg-white/15 min-[820px]:self-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-white/75">{label}</span>
        <span className="tabular block text-[17px] font-bold">{formatBRL(value)}</span>
        <SplitBreakdown parts={parts} />
      </span>
    </div>
  );
}

function Hero({ b, net, isNegative }: { b: MonthBreakdown; net: number; isNegative: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl px-[22px] py-5 text-white",
        isNegative ? "bg-ink" : "bg-primary",
      )}
    >
      <Wallet
        aria-hidden
        className="pointer-events-none absolute -top-6 -right-3.5 size-[190px] opacity-10"
        strokeWidth={1.4}
      />
      <span className="relative text-[12.5px] font-semibold text-white/85">Líquido do mês</span>
      <p
        className={cn(
          "tabular relative mt-1.5 text-[36px] leading-none font-bold tracking-[-0.6px] min-[820px]:text-[44px]",
          isNegative && "text-[#f2b8a8]",
        )}
      >
        {isNegative ? "− " : ""}
        {formatBRL(Math.abs(net))}
      </p>
      {/* Top-aligned so Entradas/Saídas headers line up even when one side
          has an extra legend row ("Outras"). */}
      <div className="relative mt-4 flex flex-col gap-4 border-t border-white/15 pt-3.5 min-[820px]:flex-row min-[820px]:items-start min-[820px]:gap-0">
        <FlowColumn
          label="Entradas"
          value={b.in}
          icon={<ArrowUp className="size-4 text-[#8FE6B0]" strokeWidth={2.2} />}
          parts={[
            { label: "Consumo", value: b.consumo, color: "#E8FBEF" },
            { label: "Revenda", value: b.revenda, color: "#8FE6B0" },
            { label: "Outras", value: b.outrasEntradas, color: "#C9E9D3" },
          ]}
        />
        <div className="hidden w-px self-stretch bg-white/15 min-[820px]:mx-4 min-[820px]:block" />
        <FlowColumn
          label="Saídas"
          value={b.out}
          icon={<ArrowDown className="size-4 text-[#F2B8A8]" strokeWidth={2.2} />}
          parts={[
            { label: "Insumos", value: b.insumos, color: "#FBE3DB" },
            { label: "Operação", value: b.operacao, color: "#F2B8A8" },
          ]}
        />
      </div>
    </div>
  );
}

export function FinanceiroClient({
  storeId,
  receivablesByMonth,
  months,
  transactions,
}: FinanceiroClientProps) {
  const categoryLabels = useCategoryLabels();
  const [formOpen, setFormOpen] = useState(false);

  const currentMonthKey = getCurrentMonthKey();

  // Group every transaction into its competência month, with the
  // Consumo/Revenda and Insumos/Operação splits.
  const monthData = useMemo(() => monthBreakdown(transactions), [transactions]);

  // Selectable months: every month with activity, plus the current one, made
  // contiguous so prev/next steps through empty months gracefully.
  const range = useMemo(() => {
    const keys = [...monthData.keys(), currentMonthKey];
    const min = keys.reduce((a, b) => (a < b ? a : b));
    const max = keys.reduce((a, b) => (a > b ? a : b));
    return buildRange(min, max);
  }, [monthData, currentMonthKey]);

  const [selectedKey, setSelectedKey] = useState(currentMonthKey);
  const selectedIndex = range.indexOf(selectedKey);
  const canPrev = selectedIndex > 0;
  const canNext = selectedIndex >= 0 && selectedIndex < range.length - 1;

  const selected = monthData.get(selectedKey) ?? EMPTY;
  const net = selected.in - selected.out;
  // A month with literally nothing recorded gets the neutral "sem
  // movimentação" treatment instead of the green/dark hero.
  const hasMovement = selected.in !== 0 || selected.out !== 0;
  const isNegative = hasMovement && net < 0;
  const selectedMonthName = monthNameOnly(selectedKey);

  // Largest single outflow of the selected month — surfaced only when the
  // month closed negative ("Reforma da loja pesou no mês").
  const largestOutflow = useMemo(() => {
    if (!isNegative) return null;
    let max: FinanceTx | null = null;
    for (const tx of transactions) {
      if (tx.direction !== "out" || !tx.date) continue;
      if (monthKeyOf(tx.date) !== selectedKey) continue;
      if (!max || tx.amount > max.amount) max = tx;
    }
    return max;
  }, [transactions, selectedKey, isNegative]);

  // The header's primary action opens the same manual-lançamento sheet,
  // defaulted to "Saída" (design top-bar "Nova despesa").
  usePageAction({ label: "Nova despesa", onClick: () => setFormOpen(true) });

  // "A receber" is pinned to the CURRENT month regardless of the competência
  // being viewed.
  const currentReceivables = receivablesByMonth[currentMonthKey] ?? {
    total: 0,
    count: 0,
  };

  // Recent movements scoped to the selected competência.
  const recentTxs = useMemo(
    () =>
      transactions
        .filter((tx) => tx.date && monthKeyOf(tx.date) === selectedKey)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    [transactions, selectedKey],
  );

  const lastSix = months.slice(-6);
  const hasFlow = lastSix.some((m) => m.in > 0 || m.out > 0);
  const hasSales = months.some((m) => m.sales > 0);
  const hasTicket = lastSix.some((m) => m.avgTicket > 0 || m.activeCustomers > 0);

  return (
    <>
      {/* Competência + hero + a receber, grouped on a tinted panel */}
      <div className="mb-7 flex flex-col gap-3 rounded-[20px] border border-[#D6E4CF] bg-[#EAF1E6] p-2.5 min-[820px]:p-3.5">
        <div className="flex items-center gap-3 rounded-[14px] border border-[#E1EADC] bg-card px-3 py-2.5">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-wash text-primary">
            <Calendar className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-bold tracking-[.4px] text-ink-faint uppercase">
              Competência
            </span>
            <span className="block truncate text-[15px] font-bold text-ink">
              {competenciaLabel(selectedKey)}
            </span>
          </div>
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => canPrev && setSelectedKey(range[selectedIndex - 1])}
            disabled={!canPrev}
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-card text-ink-soft transition-colors hover:bg-mist disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => canNext && setSelectedKey(range[selectedIndex + 1])}
            disabled={!canNext}
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-card text-ink-soft transition-colors hover:bg-mist disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {hasMovement ? (
          <Hero b={selected} net={net} isNegative={isNegative} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5.5 py-6.5">
            <span className="block text-[12.5px] text-ink-faint">Líquido do mês</span>
            <p className="tabular mt-1.5 text-[44px] leading-none font-semibold tracking-[-0.6px] text-ink-faint">
              {formatBRL(0)}
            </p>
            <span className="mt-1 block text-[12.5px] text-ink-faint">
              {selectedKey === currentMonthKey
                ? `${selectedMonthName} começou hoje — nada lançado ainda.`
                : "Nenhum lançamento neste mês."}
            </span>
            <div className="mt-5">
              <Button onClick={() => setFormOpen(true)} className="rounded-[11px] font-semibold">
                Lançar despesa
              </Button>
            </div>
          </div>
        )}

        {/* Largest outflow — surfaced only when the month closed negative. */}
        {largestOutflow && (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-danger-wash px-4 py-3.5">
            <span className="flex size-9.5 shrink-0 items-center justify-center rounded-[10px] bg-destructive/15 text-destructive">
              <TriangleAlert className="size-[19px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-destructive">
                {largestOutflow.label} pesou no mês
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-soft">
                {formatBRL(largestOutflow.amount)} · {txShortMeta(largestOutflow, categoryLabels)}
              </span>
            </span>
          </div>
        )}

        {/* A receber — pinned to the current month, only when something is pending. */}
        {currentReceivables.count > 0 && (
          <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[#F0E0B8] bg-amber-wash px-4 py-4 min-[820px]:px-5">
            <Clock
              aria-hidden
              className="pointer-events-none absolute -top-[26px] -right-2.5 size-[130px] text-amber opacity-[.16]"
              strokeWidth={1.6}
            />
            <span className="relative flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#D9A21B] text-white">
              <Clock className="size-[19px]" strokeWidth={1.8} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-[11px] font-bold tracking-[.4px] text-[#8A6312] uppercase">
                A receber · mês atual
              </span>
              <span className="block text-[11.5px] text-[#A0895A]">
                {currentReceivables.count}{" "}
                {currentReceivables.count === 1
                  ? "pedido ainda não pago"
                  : "pedidos ainda não pagos"}
              </span>
            </span>
            <span className="tabular relative shrink-0 text-[20px] font-bold tracking-[-0.8px] whitespace-nowrap text-[#7A5410] min-[820px]:text-[26px]">
              {formatBRL(currentReceivables.total)}
            </span>
          </div>
        )}
      </div>

      <SectionHeading title="Evolução" chip="Últimos 12 meses" />

      <TintedCard tone="green" icon={CircleDollarSign} title="Vendas" className="mb-4">
        {hasSales ? (
          <MonthlySalesChart months={months} />
        ) : (
          <p className="py-6 text-center text-[12.5px] text-ink-faint">
            As vendas aparecem aqui conforme os pedidos entram.
          </p>
        )}
      </TintedCard>

      <div className="grid grid-cols-1 gap-4 min-[820px]:grid-cols-2">
        <TintedCard tone="green" icon={ArrowLeftRight} title="Entradas e saídas">
          {hasFlow ? (
            <>
              <EntradaSaidaChart months={lastSix} />
            </>
          ) : (
            <p className="py-6 text-center text-[12.5px] text-ink-faint">
              Nenhuma entrada ou saída nos últimos 6 meses.
            </p>
          )}
        </TintedCard>

        <TintedCard
          tone="blue"
          icon={ReceiptText}
          title="Movimentações recentes"
          bodyClassName="px-5 pt-1 pb-3"
          action={
            <Link
              href={`/s/${storeId}/financeiro/movimentacoes?mes=${selectedKey}`}
              aria-label="Ver todas"
              title="Ver todas"
              className="flex size-7 items-center justify-center rounded-lg bg-white/70 text-info transition-colors hover:bg-white"
            >
              <ArrowUpRight className="size-4" strokeWidth={2.2} />
            </Link>
          }
        >
          {recentTxs.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={`Sem movimentações em ${selectedMonthName.toLowerCase()}`}
              description="Vendas e despesas aparecem aqui assim que forem registradas."
            />
          ) : (
            <ul className="flex flex-col [&>li:first-child]:border-t-0">
              {recentTxs.map((tx) => (
                <MovementRow key={tx.id} tx={tx} />
              ))}
            </ul>
          )}
        </TintedCard>
      </div>

      <TintedCard tone="pink" icon={TrendingUp} title="Ticket médio e clientes ativos" className="mt-4">
        {hasTicket ? (
          <>
            <TicketChart months={lastSix} />
          </>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-ink-faint">
            Sem pedidos nos últimos 6 meses.
          </p>
        )}
      </TintedCard>

      <ManualTxSheet storeId={storeId} open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}

const EMPTY: MonthBreakdown = {
  in: 0,
  out: 0,
  consumo: 0,
  revenda: 0,
  outrasEntradas: 0,
  insumos: 0,
  operacao: 0,
};
