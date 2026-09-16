"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Lock,
  Pencil,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { FinanceTx } from "@/lib/types";
import { formatBRL, orderCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteManualTxAction } from "@/actions/finance";
import { EmptyState } from "@/components/ui/empty-state";
import { DataList, DataListHeader, DataListRow } from "@/components/ui/data-list";
import { usePageAction, usePageHeader } from "@/components/shell/app-shell-context";
import { monthLabel, txMeta } from "../finance-shared";
import { ManualTxSheet } from "../manual-tx-sheet";

type FilterTab = "todos" | "entradas" | "saidas" | "avulsos" | "vinculados";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "entradas", label: "Entradas" },
  { value: "saidas", label: "Saídas" },
  { value: "avulsos", label: "Avulsos" },
  { value: "vinculados", label: "Vinculados" },
];

export function MovimentacoesClient({
  storeId,
  mes,
  transactions,
  stockItemNames,
}: {
  storeId: string;
  mes: string;
  transactions: FinanceTx[];
  stockItemNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<FilterTab>("todos");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const count = transactions.length;
  usePageHeader({
    title: "Movimentações",
    subtitle: `${monthLabel(mes)} · ${count} ${count === 1 ? "lançamento" : "lançamentos"}`,
  });
  usePageAction({ label: "Novo lançamento", onClick: () => setCreating(true) });

  const filtered = useMemo(() => {
    switch (tab) {
      case "entradas":
        return transactions.filter((tx) => tx.direction === "in");
      case "saidas":
        return transactions.filter((tx) => tx.direction === "out");
      case "avulsos":
        return transactions.filter((tx) => tx.source === "manual");
      case "vinculados":
        return transactions.filter((tx) => tx.source !== "manual");
      default:
        return transactions;
    }
  }, [transactions, tab]);

  const selected = transactions.find((tx) => tx.id === selectedId) ?? null;

  function handleDelete(tx: FinanceTx, e: React.MouseEvent) {
    e.stopPropagation();
    deleteManualTxAction(storeId, tx.id).then((result) => {
      if (result.ok) {
        toast.success("Lançamento excluído.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
              tab === t.value
                ? "bg-ink text-white"
                : "border border-border bg-card text-ink-soft hover:border-primary/40",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={
            transactions.length === 0
              ? "Nenhum lançamento neste mês"
              : "Nada neste filtro"
          }
          description={
            transactions.length === 0
              ? "Vendas e despesas aparecem aqui assim que forem registradas."
              : "Tente outro filtro."
          }
        />
      ) : (
        <>
          {/* Desktop: responsive data table. */}
          <DataList columns="1fr 210px 140px 108px" className="hidden min-[820px]:block">
            <DataListHeader>
              <span>Lançamento</span>
              <span>Origem</span>
              <span className="text-right">Valor</span>
              <span className="text-right">Ações</span>
            </DataListHeader>
            {filtered.map((tx) => (
              <DataListRow key={tx.id} onClick={() => setSelectedId(tx.id)}>
                <LancamentoCell tx={tx} />
                <OrigemCell tx={tx} storeId={storeId} stockItemNames={stockItemNames} />
                <span
                  className={cn(
                    "tabular text-right text-[14px] font-bold",
                    tx.direction === "in" ? "text-primary" : "text-destructive",
                  )}
                >
                  {tx.direction === "in" ? "+ " : "− "}
                  {formatBRL(tx.amount)}
                </span>
                <AcoesCell tx={tx} onDelete={handleDelete} />
              </DataListRow>
            ))}
          </DataList>

          {/* Mobile: card stack. */}
          <ul className="space-y-3 min-[820px]:hidden">
            {filtered.map((tx) => (
              <li key={tx.id}>
                {/* A <div>, not a <button> — the avulso variant nests a real
                    <button> (Excluir) inside, and <button> can't contain
                    <button> (invalid HTML, breaks hydration). */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(tx.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(tx.id);
                    }
                  }}
                  className="w-full cursor-pointer rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                >
                  <div className="flex items-center gap-3">
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
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-muted pt-2.5">
                    <span className="text-[11.5px] font-semibold text-ink-faint">
                      {tx.source === "manual" ? "Avulso" : "Vinculado"}
                    </span>
                    {tx.source === "manual" && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(tx, e)}
                        aria-label="Excluir lançamento"
                        className="flex size-7 items-center justify-center rounded-lg text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3.5 px-0.5 text-[12px] text-ink-faint text-wrap-pretty">
        Lançamentos vinculados a pedidos ou a entradas de estoque não são editados
        aqui — o valor acompanha a origem.
      </p>

      <ManualTxSheet
        storeId={storeId}
        open={creating || selectedId !== null}
        editingTx={creating ? null : selected}
        stockItemNames={stockItemNames}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setSelectedId(null);
          }
        }}
      />
    </>
  );
}

function LancamentoCell({ tx }: { tx: FinanceTx }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "flex size-8.5 shrink-0 items-center justify-center rounded-lg",
          tx.direction === "in" ? "bg-mint-wash text-primary" : "bg-danger-wash text-destructive",
        )}
      >
        {tx.direction === "in" ? (
          <ArrowUpRight className="size-4" />
        ) : (
          <ArrowDownRight className="size-4" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-ink">{tx.label}</span>
        <span className="block truncate text-[11.5px] text-ink-faint">{txMeta(tx)}</span>
      </span>
    </span>
  );
}

function OrigemCell({
  tx,
  storeId,
  stockItemNames,
}: {
  tx: FinanceTx;
  storeId: string;
  stockItemNames: Record<string, string>;
}) {
  if (tx.source === "manual") {
    return (
      <span className="inline-flex w-fit items-center rounded-lg bg-wash px-2.5 py-1 text-[12px] font-semibold text-ink-faint">
        Avulso
      </span>
    );
  }
  const isStock = tx.source === "stock";
  const id = isStock ? tx.stockItemId : tx.orderId;
  const label = isStock
    ? (id && stockItemNames[id]) || "Item removido"
    : id
      ? `Pedido #${orderCode(id)}`
      : "Pedido removido";
  const href = id
    ? isStock
      ? `/s/${storeId}/estoque?item=${id}`
      : `/s/${storeId}/pedidos?order=${id}`
    : null;

  if (!href) {
    return (
      <span className="inline-flex w-fit items-center rounded-lg bg-wash px-2.5 py-1 text-[12px] font-semibold text-ink-faint">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-mint-wash px-2.5 py-1 text-[12px] font-semibold text-primary"
    >
      <ExternalLink className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function AcoesCell({
  tx,
  onDelete,
}: {
  tx: FinanceTx;
  onDelete: (tx: FinanceTx, e: React.MouseEvent) => void;
}) {
  if (tx.source !== "manual") {
    const title =
      tx.source === "order"
        ? "Vinculado ao pedido — edite pelo pedido"
        : "Vinculado ao estoque — edite pela entrada de estoque";
    return (
      <span className="flex justify-end">
        <span
          title={title}
          className="flex size-8 items-center justify-center rounded-lg border border-border text-ink-faint/60"
        >
          <Lock className="size-3.5" />
        </span>
      </span>
    );
  }
  return (
    <span className="flex justify-end gap-1.5">
      {/* Decorative — the whole row already opens the edit sheet on click;
          this just signals "editable" and relies on click bubbling. */}
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg text-ink-soft"
      >
        <Pencil className="size-3.5" />
      </span>
      <button
        type="button"
        aria-label="Excluir lançamento"
        onClick={(e) => onDelete(tx, e)}
        className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-danger-wash"
      >
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );
}
