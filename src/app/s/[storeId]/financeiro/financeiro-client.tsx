"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MoreVertical,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { FinanceTx } from "@/lib/types";
import { formatBRL, formatRelative, orderCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteManualTxAction } from "@/actions/finance";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePageAction } from "@/components/shell/app-shell-context";
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

/** Transaction meta line: "Pedido #AB3F · Pix · hoje" or "Aluguel · ontem". */
function txMeta(tx: FinanceTx): string {
  const parts: string[] = [];
  if (tx.source === "order") {
    parts.push(tx.orderId ? `Pedido #${orderCode(tx.orderId)}` : "Pedido");
    if (tx.payMethod) parts.push(PAY_METHOD_LABELS[tx.payMethod] ?? tx.payMethod);
  } else if (CATEGORY_LABELS[tx.category]) {
    parts.push(CATEGORY_LABELS[tx.category]);
  } else {
    parts.push("Manual");
  }
  if (tx.date) parts.push(formatRelative(tx.date));
  return parts.join(" · ");
}

function MovementRow({
  tx,
  storeId,
}: {
  tx: FinanceTx;
  storeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isManual = tx.source === "manual";

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteManualTxAction(storeId, tx.id);
      if (result.ok) {
        toast.success("Lançamento excluído.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-t border-wash py-3 first:border-t-0",
        pending && "opacity-50",
      )}
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
        <span className="block truncate text-[13.5px] font-semibold text-ink">
          {tx.label}
        </span>
        <span className="block truncate text-[11.5px] text-ink-faint">
          {txMeta(tx)}
        </span>
      </span>
      <span
        className={cn(
          "tabular shrink-0 text-[14px] font-bold",
          tx.direction === "in" ? "text-primary" : "text-destructive",
        )}
      >
        {tx.direction === "in" ? "+ " : "− "}
        {formatBRL(tx.amount)}
      </span>
      {isManual ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Ações do lançamento"
              disabled={pending}
              className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-mist hover:text-ink-soft data-[state=open]:bg-mist"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive data-highlighted:text-destructive"
              onSelect={handleDelete}
            >
              <DropdownMenuItemIcon className="bg-danger-wash text-destructive">
                <Trash2 />
              </DropdownMenuItemIcon>
              Excluir lançamento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // Keep alignment stable; order mirrors can't be deleted here.
        <span className="size-8 shrink-0" aria-hidden />
      )}
    </li>
  );
}

export function FinanceiroClient({
  storeId,
  receivablesByMonth,
  months,
  transactions,
}: FinanceiroClientProps) {
  const [formOpen, setFormOpen] = useState(false);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;

  // Group every transaction into its competência month (in/out totals).
  const monthData = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    for (const tx of transactions) {
      if (!tx.date) continue;
      const key = monthKeyOf(tx.date);
      let entry = map.get(key);
      if (!entry) {
        entry = { in: 0, out: 0 };
        map.set(key, entry);
      }
      if (tx.direction === "in") entry.in += tx.amount;
      else entry.out += tx.amount;
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

  const selected = monthData.get(selectedKey) ?? { in: 0, out: 0 };
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
    return { up: diff >= 0, pct: Math.abs(pct) };
  }, [selectedIndex, range, monthData, net]);

  // Financeiro has no top-bar add (design hides it on dashboard/financeiro);
  // the "Novo lançamento" trigger stays inline in the competência row below.
  usePageAction(null);

  // "A receber" is pinned to the CURRENT month regardless of the competência
  // being viewed (design finCurAR = financeMonths[0]).
  const currentReceivables = receivablesByMonth[currentMonthKey] ?? {
    total: 0,
    count: 0,
  };

  // Recent movements across all months (design "Movimentações recentes").
  const recentTxs = useMemo(
    () =>
      [...transactions]
        .filter((tx) => tx.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 12),
    [transactions],
  );

  return (
    <>
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
        <Button
          onClick={() => setFormOpen(true)}
          className="hidden gap-1.5 rounded-xl font-semibold sm:flex"
        >
          <Plus className="size-4" />
          Novo lançamento
        </Button>
        <Button
          onClick={() => setFormOpen(true)}
          size="icon"
          aria-label="Novo lançamento"
          className="rounded-xl sm:hidden"
        >
          <Plus className="size-4" />
        </Button>
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
                  delta.up ? "text-leaf" : "text-[#f2b8a8]",
                )}
              >
                {delta.up ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {delta.pct}% vs. mês ant.
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
                <ArrowDown className="size-4 text-[#f2b8a8]" />
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

        {/* A receber — pinned to the current month (design "· mês atual") */}
        <div className="mt-3.5 flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber-wash px-4 py-3">
          <span className="flex size-9.5 shrink-0 items-center justify-center rounded-[10px] bg-amber/20 text-amber">
            <Clock className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-amber">
              A receber · mês atual
            </span>
            <span className="block text-[11.5px] text-ink-soft">
              {currentReceivables.count}{" "}
              {currentReceivables.count === 1
                ? "pedido em aberto"
                : "pedidos em aberto"}
            </span>
          </span>
          <span className="tabular shrink-0 text-[22px] font-bold text-amber">
            {formatBRL(currentReceivables.total)}
          </span>
        </div>
      </div>

      {/* Two-column: trend chart (left) + recent movements (right) */}
      <div className="grid grid-cols-1 gap-4 min-[820px]:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-[15px] font-semibold text-ink">Entradas e saídas</h3>
          <p className="mb-4 mt-0.5 text-[12.5px] text-ink-faint">Últimos 6 meses</p>
          <EntradaSaidaChart months={months} />
          <div className="mt-3.5 flex gap-5 border-t border-wash pt-3.5">
            <span className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <span className="size-2.5 rounded-[3px] bg-leaf" />
              Entradas
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <span className="size-2.5 rounded-[3px] bg-[#e2c089]" />
              Saídas
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-1 text-[15px] font-semibold text-ink">
            Movimentações recentes
          </h3>
          {recentTxs.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Sem lançamentos"
              description="Pagamentos de pedidos e lançamentos manuais aparecerão aqui."
            />
          ) : (
            <ul className="flex flex-col">
              {recentTxs.map((tx) => (
                <MovementRow key={tx.id} tx={tx} storeId={storeId} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Ticket médio & clientes ativos — full width */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">
              Ticket médio e clientes ativos
            </h3>
            <p className="mt-0.5 text-[12.5px] text-ink-faint">Últimos 6 meses</p>
          </div>
          <div className="flex gap-4">
            <span className="flex items-center gap-2 text-[12px] text-ink-soft">
              <span className="h-[3px] w-4 rounded-full bg-primary" />
              Ticket médio
            </span>
            <span className="flex items-center gap-2 text-[12px] text-ink-soft">
              <span className="size-2.5 rounded-[3px] bg-[#cde3c2]" />
              Clientes ativos
            </span>
          </div>
        </div>
        <TicketChart months={months} />
      </div>

      <ManualTxSheet storeId={storeId} open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
