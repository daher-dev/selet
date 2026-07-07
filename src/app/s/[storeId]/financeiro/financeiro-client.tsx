"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { FinanceTx } from "@/lib/types";
import { formatBRL, formatDateShort, orderCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { EntradaSaidaChart, TicketChart } from "@/components/charts/finance-charts";
import { ManualTxSheet } from "./manual-tx-sheet";

export interface MonthBucket {
  label: string;
  in: number;
  out: number;
  avgTicket: number;
  activeCustomers: number;
}

interface FinanceiroClientProps {
  storeId: string;
  saldo: number;
  receivablesByMonth: Record<string, { total: number; count: number }>;
  months: MonthBucket[];
  transactions: FinanceTx[];
}

const CATEGORY_LABELS: Record<string, string> = {
  vendas: "Vendas",
  compras: "Compras",
  salarios: "Salários",
  aluguel: "Aluguel",
  marketing: "Marketing",
  outros: "Outros",
};

const PAY_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

/** "2026-07" → key from an ISO date. */
function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-07" → "Julho de 2026" (competência label). */
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const s = monthFmt.format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Contiguous list of month keys from `min` to `max`, inclusive. */
function buildRange(min: string, max: string): string[] {
  const [minY, minM] = min.split("-").map(Number);
  const [maxY, maxM] = max.split("-").map(Number);
  const out: string[] = [];
  let y = minY;
  let m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Transaction meta line: "Pedido #AB3F · Pix" or "Manual · Aluguel", + date. */
function txMeta(tx: FinanceTx): string {
  const parts: string[] = [];
  if (tx.source === "order") {
    parts.push(tx.orderId ? `Pedido #${orderCode(tx.orderId)}` : "Pedido");
    if (tx.payMethod) parts.push(PAY_METHOD_LABELS[tx.payMethod] ?? tx.payMethod);
  } else {
    parts.push("Manual");
    if (CATEGORY_LABELS[tx.category]) parts.push(CATEGORY_LABELS[tx.category]);
  }
  if (tx.date) parts.push(formatDateShort(tx.date));
  return parts.join(" · ");
}

export function FinanceiroClient({
  storeId,
  saldo,
  receivablesByMonth,
  months,
  transactions,
}: FinanceiroClientProps) {
  const [formOpen, setFormOpen] = useState(false);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;

  // Group every transaction into its competência month (in/out/list).
  const monthData = useMemo(() => {
    const map = new Map<string, { in: number; out: number; txs: FinanceTx[] }>();
    for (const tx of transactions) {
      if (!tx.date) continue;
      const key = monthKeyOf(tx.date);
      let entry = map.get(key);
      if (!entry) {
        entry = { in: 0, out: 0, txs: [] };
        map.set(key, entry);
      }
      if (tx.direction === "in") entry.in += tx.amount;
      else entry.out += tx.amount;
      entry.txs.push(tx);
    }
    return map;
  }, [transactions]);

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

  const selected = monthData.get(selectedKey) ?? { in: 0, out: 0, txs: [] };
  const net = selected.in - selected.out;

  // Month-over-month delta — only when the prior month has real activity, so we
  // never invent a comparison against a fabricated zero.
  const delta = useMemo(() => {
    if (selectedIndex <= 0) return null;
    const prev = monthData.get(range[selectedIndex - 1]);
    if (!prev) return null;
    const prevNet = prev.in - prev.out;
    if (prevNet === 0) return null;
    const diff = net - prevNet;
    const pct = Math.round((diff / Math.abs(prevNet)) * 100);
    return { up: diff >= 0, label: `${diff >= 0 ? "+" : "−"}${Math.abs(pct)}%` };
  }, [selectedIndex, range, monthData, net]);

  const monthReceivables = receivablesByMonth[selectedKey];
  const monthTxs = useMemo(
    () =>
      [...selected.txs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [selected.txs],
  );

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle="Entradas, saídas e saldo da loja."
        action={
          <Button
            onClick={() => setFormOpen(true)}
            className="gap-1.5 rounded-xl font-semibold"
          >
            <Plus className="size-4" />
            Lançamento
          </Button>
        }
      />

      {/* Competência (month selector) */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-mist text-primary">
          <Calendar className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            Competência
          </span>
          <span className="block truncate text-[15px] font-bold text-ink">
            {monthLabel(selectedKey)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => canPrev && setSelectedKey(range[selectedIndex - 1])}
          disabled={!canPrev}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-paper text-ink-soft transition-colors hover:bg-mist disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => canNext && setSelectedKey(range[selectedIndex + 1])}
          disabled={!canNext}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-paper text-ink-soft transition-colors hover:bg-mist disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Hero: net of the selected month */}
      <div className="mb-4">
        <div className="rounded-2xl bg-primary p-5 text-white">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold tracking-wide text-white/85">
              Líquido do mês
            </span>
            <span className="flex-1" />
            {delta && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[11.5px] font-semibold",
                  delta.up ? "text-leaf" : "text-white/70",
                )}
              >
                {delta.up ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {delta.label}
              </span>
            )}
          </div>
          <p className="tabular mt-1.5 text-[30px] font-bold leading-none tracking-[-0.5px]">
            {formatBRL(net)}
          </p>
          <div className="mt-4 flex border-t border-white/15 pt-3.5">
            <div className="flex flex-1 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <ArrowUp className="size-4 text-leaf" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-white/75">Entradas</span>
                <span className="tabular block text-[16px] font-bold">
                  {formatBRL(selected.in)}
                </span>
              </span>
            </div>
            <div className="mx-4 w-px bg-white/15" />
            <div className="flex flex-1 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <ArrowDown className="size-4 text-white/80" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-white/75">Saídas</span>
                <span className="tabular block text-[16px] font-bold">
                  {formatBRL(selected.out)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* All-time balance, kept as a secondary stat */}
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Saldo total
          </span>
          <span
            className={cn(
              "tabular text-[16px] font-bold",
              saldo < 0 ? "text-destructive" : "text-ink",
            )}
          >
            {formatBRL(saldo)}
          </span>
        </div>

        {monthReceivables && monthReceivables.count > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber-wash px-4 py-3">
            <Clock className="size-5 shrink-0 text-amber" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-amber">
                A receber
              </span>
              <span className="block text-[11.5px] text-ink-soft">
                {monthReceivables.count}{" "}
                {monthReceivables.count === 1
                  ? "pedido em aberto"
                  : "pedidos em aberto"}
              </span>
            </span>
            <span className="tabular shrink-0 text-[19px] font-bold text-amber">
              {formatBRL(monthReceivables.total)}
            </span>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="mb-4 space-y-2.5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-[13px] font-bold text-ink">
            Entradas × Saídas{" "}
            <span className="font-medium text-ink-faint">· últimos 6 meses</span>
          </h3>
          <EntradaSaidaChart months={months} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-[13px] font-bold text-ink">
            Ticket médio &amp; clientes ativos
          </h3>
          <TicketChart months={months} />
        </div>
      </div>

      {/* Transactions for the selected month */}
      <h3 className="mb-2 text-[13px] font-bold text-ink">Movimentações do mês</h3>
      {monthTxs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem lançamentos neste mês"
          description="Pagamentos de pedidos e lançamentos manuais aparecerão aqui."
        />
      ) : (
        <ul className="space-y-2">
          {monthTxs.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  tx.direction === "in"
                    ? "bg-mint-wash text-primary"
                    : "bg-danger-wash text-destructive",
                )}
              >
                {tx.direction === "in" ? (
                  <ArrowUpRight className="size-4" />
                ) : (
                  <ArrowDownRight className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {tx.label}
                </span>
                <span className="block truncate text-[11px] text-ink-faint">
                  {txMeta(tx)}
                </span>
              </span>
              <span
                className={cn(
                  "tabular shrink-0 text-[13.5px] font-bold",
                  tx.direction === "in" ? "text-primary" : "text-destructive",
                )}
              >
                {tx.direction === "in" ? "+" : "−"}
                {formatBRL(tx.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ManualTxSheet storeId={storeId} open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
