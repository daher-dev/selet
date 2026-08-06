"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Ticket } from "lucide-react";
import type { Cartela } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { balanceValue, remainingUses } from "@/lib/cartelas";
import { usePageAction } from "@/components/shell/app-shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { CartelasList } from "./cartelas-list";
import { CartelaHistorySheet } from "./cartela-history-sheet";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" });

/** "2026-7" key from an ISO date, for same-month grouping. */
function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[12.5px] text-ink-faint">{label}</p>
      <p className="tabular mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] text-ink-faint">{sub}</p>
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

  usePageAction(null);

  // Cancelled cartelas are hidden everywhere on this screen — the money
  // stays on the order that sold them, so there's no separate ledger entry
  // to reconcile by keeping them visible here.
  const active = useMemo(
    () => cartelas.filter((c) => c.status !== "cancelada"),
    [cartelas],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const monthKey = monthKeyOf(now.toISOString());

    const withBalance = active.filter((c) => remainingUses(c) > 0);
    const circulacao = withBalance.reduce((s, c) => s + balanceValue(c), 0);

    const soldThisMonth = active.filter(
      (c) => monthKeyOf(c.purchasedAt) === monthKey,
    );
    const recebidoMes = soldThisMonth.reduce((s, c) => s + c.amount, 0);

    let usosMes = 0;
    let descontoMes = 0;
    for (const c of active) {
      for (const u of c.uses) {
        if (monthKeyOf(u.at) === monthKey) {
          usosMes += 1;
          descontoMes += c.unitValue;
        }
      }
    }

    return {
      circulacao,
      circulacaoCount: withBalance.length,
      recebidoMes,
      soldCount: soldThisMonth.length,
      usosMes,
      descontoMes,
      monthLabel: monthName.format(now),
    };
  }, [active]);

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
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Saldo em circulação"
          value={formatBRL(stats.circulacao)}
          sub={`${stats.circulacaoCount} cartela${stats.circulacaoCount === 1 ? "" : "s"} com usos restantes`}
        />
        <StatCard
          label="Recebido no mês"
          value={formatBRL(stats.recebidoMes)}
          sub={`${stats.soldCount} cartela${stats.soldCount === 1 ? "" : "s"} vendida${stats.soldCount === 1 ? "" : "s"} em ${stats.monthLabel}`}
        />
        <StatCard
          label="Usos resgatados no mês"
          value={String(stats.usosMes)}
          sub={`${formatBRL(stats.descontoMes)} de desconto concedido`}
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
