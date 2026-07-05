"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Plus,
  Wallet,
} from "lucide-react";
import type { FinanceTx } from "@/lib/types";
import { formatBRL, formatDateShort } from "@/lib/format";
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
  monthIn: number;
  monthOut: number;
  receivables: { total: number; count: number };
  months: MonthBucket[];
  transactions: FinanceTx[];
}

export function FinanceiroClient({
  storeId,
  saldo,
  monthIn,
  monthOut,
  receivables,
  months,
  transactions,
}: FinanceiroClientProps) {
  const [formOpen, setFormOpen] = useState(false);

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

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="col-span-2 rounded-2xl bg-primary p-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-leaf">
            Saldo
          </p>
          <p className="tabular mt-1 text-[30px] font-bold leading-none tracking-[-0.4px]">
            {formatBRL(saldo)}
          </p>
        </div>
        <SummaryCard
          icon={ArrowUpRight}
          label="Entradas (mês)"
          value={formatBRL(monthIn)}
          tone="text-primary"
        />
        <SummaryCard
          icon={ArrowDownRight}
          label="Saídas (mês)"
          value={formatBRL(monthOut)}
          tone="text-destructive"
        />
        {receivables.count > 0 && (
          <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber-wash px-4 py-3">
            <Clock className="size-4.5 shrink-0 text-amber" />
            <p className="text-[13px] text-ink-soft">
              <strong className="tabular font-bold text-ink">
                {formatBRL(receivables.total)}
              </strong>{" "}
              a receber em {receivables.count}{" "}
              {receivables.count === 1 ? "pedido" : "pedidos"}
            </p>
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

      {/* Transactions */}
      <h3 className="mb-2 text-[13px] font-bold text-ink">Últimos lançamentos</h3>
      {transactions.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem lançamentos"
          description="Pagamentos de pedidos e lançamentos manuais aparecerão aqui."
        />
      ) : (
        <ul className="space-y-2">
          {transactions.map((tx) => (
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
                <span className="text-[11px] capitalize text-ink-faint">
                  {tx.category} · {tx.date ? formatDateShort(tx.date) : ""}
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

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <span className={cn("flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint")}>
        <Icon className={cn("size-3.5", tone)} />
        {label}
      </span>
      <p className="tabular mt-1.5 text-[18px] font-bold text-ink">{value}</p>
    </div>
  );
}
