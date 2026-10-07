"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Ticket } from "lucide-react";
import type { Cartela } from "@/lib/types";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { cartelaMonthlyStats } from "@/lib/cartelas";
import { cn } from "@/lib/utils";
import { usePageAction } from "@/components/shell/app-shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { MiniBars, type MiniBar } from "@/components/charts/mini-bars";
import { CartelasList } from "./cartelas-list";
import { CartelaHistorySheet } from "./cartela-history-sheet";

/** One stat card of the Cartelas header: title (+ optional control), headline for the current month, and a 6-month bar chart. */
function ChartCard({
  title,
  control,
  value,
  bars,
  name,
}: {
  title: string;
  control?: React.ReactNode;
  value: string;
  bars: MiniBar[];
  name: string;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-[18px] py-4">
      <div className="flex min-h-[22px] items-center justify-between">
        <span className="text-[12.5px] text-ink-faint">{title}</span>
        {control}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="tabular text-[30px] font-semibold leading-tight tracking-[-.4px] text-ink">{value}</span>
        <span className="text-[12px] text-ink-faint">este mês</span>
      </div>
      <div className="mt-2.5 border-t border-[#eef3ec] pt-2">
        <MiniBars bars={bars} name={name} className="mt-1.5" />
      </div>
    </div>
  );
}

/** R$ / Unid. segmented switch of the "Vendido" card. */
function UnitToggle({ cash, onChange }: { cash: boolean; onChange: (cash: boolean) => void }) {
  const btn = (on: boolean, label: string, aria: string, next: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      aria-label={aria}
      onClick={() => onChange(next)}
      className={cn(
        "rounded-md px-[9px] py-[3px] text-[11px] font-semibold transition-colors",
        on ? "bg-primary text-primary-foreground" : "text-ink-soft hover:text-ink",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-0.5 rounded-lg bg-[#eef3ec] p-0.5">
      {btn(cash, "R$", "Valor vendido em reais", true)}
      {btn(!cash, "Unid.", "Cartelas vendidas em unidades", false)}
    </div>
  );
}

interface CartelasClientProps {
  storeId: string;
  cartelas: Cartela[];
}

/** Cartelas screen: no tabs, no header action (a cartela is only ever sold from within a Pedidos order) — just the stat row, the punch legend, and the list. */
export function CartelasClient({ storeId, cartelas }: CartelasClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [soldInCash, setSoldInCash] = useState(true);

  usePageAction(null);

  // Cancelled cartelas are hidden everywhere on this screen — the money
  // stays on the order that sold them, so there's no separate ledger entry
  // to reconcile by keeping them visible here.
  const active = useMemo(
    () => cartelas.filter((c) => c.status !== "cancelada"),
    [cartelas],
  );

  // Last 6 months, oldest first; the final entry is the current month.
  const months = useMemo(() => cartelaMonthlyStats(active, new Date()), [active]);
  const now = months[months.length - 1];

  const bars = useMemo(() => {
    const bar = (value: (m: (typeof months)[number]) => number, display: (n: number) => string): MiniBar[] =>
      months.map((m) => ({ key: m.key, label: m.label, value: value(m), display: display(value(m)), current: m.current }));
    return {
      balance: bar((m) => m.balance, formatBRLCompact),
      soldCash: bar((m) => m.soldAmount, formatBRLCompact),
      soldUnits: bar((m) => m.soldCount, String),
      uses: bar((m) => m.uses, String),
    };
  }, [months]);

  const selected = active.find((c) => c.id === selectedId) ?? null;

  if (active.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="Nenhuma cartela vendida ainda"
        description="Uma cartela é montada na hora da venda: abra um pedido para um cliente e use a aba Cartela para vender a primeira."
      />
    );
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <ChartCard
          title="Saldo em circulação"
          value={formatBRL(now.balance)}
          bars={bars.balance}
          name="Saldo em circulação por mês"
        />
        <ChartCard
          title={soldInCash ? "Vendido" : "Cartelas vendidas"}
          control={<UnitToggle cash={soldInCash} onChange={setSoldInCash} />}
          value={soldInCash ? formatBRL(now.soldAmount) : String(now.soldCount)}
          bars={soldInCash ? bars.soldCash : bars.soldUnits}
          name={soldInCash ? "Vendido por mês (R$)" : "Cartelas vendidas por mês (unidades)"}
        />
        <ChartCard
          title="Usos resgatados"
          value={String(now.uses)}
          bars={bars.uses}
          name="Usos resgatados por mês"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 pl-0.5">
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className="size-[13px] shrink-0 rounded-full bg-primary" />
          uso disponível
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className="flex size-[13px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#D3DDCE] text-[#A8B4AC]">
            <Check className="size-2" strokeWidth={3.4} />
          </span>
          uso já consumido
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className="size-[13px] shrink-0 rounded-full bg-[#D9A11B]" />
          brinde
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className="flex size-[13px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#B6A4D8] text-[#7A63B8]">
            <Minus className="size-1.5" strokeWidth={4} />
          </span>
          ajuste manual (sem produto)
        </span>
      </div>

      <CartelasList cartelas={active} onSelect={(c) => setSelectedId(c.id)} />

      <CartelaHistorySheet
        storeId={storeId}
        cartela={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </>
  );
}
