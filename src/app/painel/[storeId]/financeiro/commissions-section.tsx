"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Percent } from "lucide-react";
import { toast } from "sonner";
import type { CommissionItemRow, CommissionPayment, FinanceTx, PayMethod } from "@/lib/types";
import { PAY_METHODS } from "@/lib/types";
import { formatBRL, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  listCommissionItemsAction,
  registerCommissionPaymentAction,
  undoCommissionPaymentAction,
} from "@/actions/commissions";
import { PAY_METHOD_META } from "@/components/order-meta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dayMonth, monthKeyOf } from "./finance-shared";

export interface SellerCommission {
  email: string;
  name: string;
  amount: number;
  base: number;
  items: number;
  paid: number;
  payments: CommissionPayment[];
}

/**
 * Per-seller commission of one competência, from the paid order mirrors that
 * carry it (the accrual) and the payouts registered against it.
 */
export function sellerCommissions(
  transactions: FinanceTx[],
  payments: CommissionPayment[],
  month: string,
): SellerCommission[] {
  const bySeller = new Map<string, SellerCommission>();
  const row = (email: string, name: string) => {
    let r = bySeller.get(email);
    if (!r) {
      r = { email, name, amount: 0, base: 0, items: 0, paid: 0, payments: [] };
      bySeller.set(email, r);
    }
    return r;
  };
  for (const tx of transactions) {
    if (tx.source !== "order" || !tx.commission || !tx.sellerEmail) continue;
    if (!tx.date || monthKeyOf(tx.date) !== month) continue;
    const r = row(tx.sellerEmail, tx.sellerName ?? tx.sellerEmail);
    r.amount += tx.commission.amount;
    r.base += tx.commission.base;
    r.items += tx.commission.items;
  }
  for (const p of payments) {
    if (p.month !== month) continue;
    const r = row(p.sellerEmail, p.sellerName);
    r.paid += p.amount;
    r.payments.push(p);
  }
  return [...bySeller.values()].sort((a, b) => b.amount - a.amount);
}

const csvMoney = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

function exportCsv(rows: SellerCommission[], monthName: string) {
  const lines = [
    ["Vendedor", "Itens", "Vendido", "Comissão", "Pago", "A pagar"].join(";"),
    ...rows.map((r) =>
      [
        `"${r.name.replace(/"/g, '""')}"`,
        r.items,
        csvMoney(r.base),
        csvMoney(r.amount),
        csvMoney(r.paid),
        csvMoney(Math.max(0, r.amount - r.paid)),
      ].join(";"),
    ),
  ];
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `comissoes-${monthName.toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Comissões de julho" (Mock Financeiro 1a): who is owed what, and the payout flow. */
export function CommissionsSection({
  storeId,
  month,
  monthName,
  transactions,
  payments,
}: {
  storeId: string;
  month: string;
  monthName: string;
  transactions: FinanceTx[];
  payments: CommissionPayment[];
}) {
  const rows = useMemo(
    () => sellerCommissions(transactions, payments, month),
    [transactions, payments, month],
  );
  const [pending, startTransition] = useTransition();
  const [itemsOpen, setItemsOpen] = useState(false);
  const [items, setItems] = useState<CommissionItemRow[] | null>(null);

  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const owed = rows.reduce((s, r) => s + Math.max(0, r.amount - r.paid), 0);
  const lower = monthName.toLowerCase();

  function pay(email: string, payMethod: PayMethod) {
    startTransition(async () => {
      const result = await registerCommissionPaymentAction({ storeId, month, sellerEmail: email, payMethod });
      if (result.ok) toast.success("Pagamento de comissão registrado.");
      else toast.error(result.error);
    });
  }

  function undo(r: SellerCommission) {
    startTransition(async () => {
      for (const p of r.payments) {
        const result = await undoCommissionPaymentAction(storeId, p.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }
      toast.success("Pagamento desfeito.");
    });
  }

  function openItems() {
    setItemsOpen(true);
    setItems(null);
    listCommissionItemsAction(storeId, month).then((res) => {
      if (res.ok) setItems(res.rows);
      else {
        toast.error(res.error);
        setItemsOpen(false);
      }
    });
  }

  return (
    <section
      aria-labelledby="com-t"
      className="mb-7 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-commission-line bg-commission-wash px-5 py-3.5">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-violet text-white">
          <Percent aria-hidden className="size-[17px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <h2 id="com-t" className="text-[15px] font-bold text-ink">
            Comissões de {lower}
          </h2>
          <span className="block text-[12px] text-commission/80">
            Só itens do cardápio com comissão · % sobre o valor vendido, já com desconto
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[11px] font-bold tracking-[.4px] text-commission/80 uppercase">
            A pagar
          </span>
          <span className="tabular block text-xl font-bold text-commission">{formatBRL(owed)}</span>
        </span>
        <button
          type="button"
          onClick={() => exportCsv(rows, monthName)}
          className="h-9 rounded-[9px] border border-commission-line bg-white px-3 text-[12.5px] font-semibold text-commission transition-colors hover:bg-commission-soft"
        >
          Exportar
        </button>
      </div>

      <div className="hidden grid-cols-[1fr_160px_190px] gap-4 px-5 py-2.5 text-[10.5px] font-bold tracking-[.5px] text-ink-soft uppercase min-[820px]:grid">
        <span>Vendedor</span>
        <span className="text-right">Comissão</span>
        <span className="text-right">Situação</span>
      </div>

      {rows.map((r) => {
        const remaining = Math.max(0, r.amount - r.paid);
        const settled = remaining === 0 && r.paid > 0;
        const lastPaid = r.payments.reduce<string>((a, p) => (p.paidAt > a ? p.paidAt : a), "");
        return (
          <div
            key={r.email}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-t border-[#F0F4ED] px-5 py-3.5 min-[820px]:grid-cols-[1fr_160px_190px]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-mist text-[12.5px] font-bold text-primary">
                {initials(r.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{r.name}</span>
                <span className="block text-[11.5px] text-ink-soft">
                  {r.items} {r.items === 1 ? "item" : "itens"} · {formatBRL(r.base)} vendidos
                </span>
              </span>
            </span>
            <span
              className={cn(
                "tabular text-right text-[15px] font-bold",
                settled ? "text-ink-soft" : "text-ink",
              )}
            >
              {formatBRL(r.amount)}
            </span>
            <span className="col-span-2 flex items-center justify-end gap-2 min-[820px]:col-span-1">
              {settled ? (
                <>
                  <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#E7F4EC] px-2.5 text-xs font-bold text-[#2E7D4A]">
                    <Check aria-hidden className="size-[13px]" strokeWidth={2.6} />
                    Pago em {dayMonth(lastPaid)}
                  </span>
                  <button
                    type="button"
                    onClick={() => undo(r)}
                    disabled={pending}
                    className="text-xs font-semibold text-ink-soft underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Desfazer
                  </button>
                </>
              ) : remaining > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={pending}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-border bg-white px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-mist disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {r.paid > 0 ? `Pagar restante ${formatBRL(remaining)}` : "Registrar pagamento"}
                    <ChevronDown aria-hidden className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PAY_METHODS.map((m) => (
                      <DropdownMenuItem key={m} onSelect={() => pay(r.email, m)}>
                        {PAY_METHOD_META[m].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-2.5 border-t border-[#EEF3EA] bg-paper px-5 py-3 text-xs text-ink-soft">
        <span className="flex-1">
          Total do mês {formatBRL(total)} · já incluído em Saídas. Ao registrar o pagamento, vira um
          lançamento em Movimentações.
        </span>
        <button
          type="button"
          onClick={openItems}
          className="h-[30px] px-1 text-xs font-semibold text-primary hover:underline"
        >
          Ver por item
        </button>
      </div>

      <Dialog open={itemsOpen} onOpenChange={setItemsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comissões de {lower} por item</DialogTitle>
          </DialogHeader>
          {items === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-ink-faint" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-faint">Nenhum item com comissão.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-[1fr_44px_56px_92px_84px] gap-2 pb-2 text-[10.5px] font-bold tracking-[.5px] text-ink-soft uppercase">
                <span>Item</span>
                <span className="text-right">%</span>
                <span className="text-right">Qtd</span>
                <span className="text-right">Vendido</span>
                <span className="text-right">Comissão</span>
              </div>
              {items.map((r) => (
                <div
                  key={`${r.productId}@${r.percent}`}
                  className="tabular grid grid-cols-[1fr_44px_56px_92px_84px] gap-2 border-t border-[#F0F4ED] py-2.5 text-[13px]"
                >
                  <span className="truncate font-semibold text-ink">{r.name}</span>
                  <span className="text-right text-ink-soft">{String(r.percent).replace(".", ",")}%</span>
                  <span className="text-right">{r.qty}</span>
                  <span className="text-right">{formatBRL(r.sold)}</span>
                  <span className="text-right font-bold text-commission">{formatBRL(r.commission)}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
