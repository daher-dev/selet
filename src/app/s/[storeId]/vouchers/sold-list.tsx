"use client";

import { useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import type { Voucher } from "@/lib/types";
import { formatBRL, formatDate, formatDateShort } from "@/lib/format";
import { PAY_METHOD_META } from "@/components/order-meta";
import {
  isExpiringSoon,
  remaining,
  voucherBalanceValue,
  voucherPills,
  type VoucherStatus,
} from "@/lib/vouchers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RedeemDialog } from "./redeem-dialog";

const STATUS_META: Record<VoucherStatus, { label: string; fg: string; bg: string }> = {
  ativo: { label: "Ativo", fg: "text-primary", bg: "bg-mint-wash" },
  "vence-em-breve": { label: "Vence em breve", fg: "text-amber", bg: "bg-amber-wash" },
  expirado: { label: "Expirado", fg: "text-destructive", bg: "bg-danger-wash" },
};

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "amber"
          ? "border-amber/40 bg-amber-wash/60"
          : "border-border bg-card",
      )}
    >
      <p
        className={cn(
          "text-[11.5px] font-semibold uppercase tracking-wide",
          tone === "amber" ? "text-amber" : "text-ink-faint",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1 text-[22px] font-bold",
          tone === "amber" ? "text-amber" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-ink-faint">{sub}</p>
    </div>
  );
}

function PunchBar({ total, used }: { total: number; used: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2.5 rounded-full",
            i < used ? "bg-primary" : "bg-mist",
          )}
        />
      ))}
    </div>
  );
}

interface SoldListProps {
  storeId: string;
  vouchers: Voucher[];
  onSell: () => void;
}

export function SoldList({ storeId, vouchers, onSell }: SoldListProps) {
  const [redeeming, setRedeeming] = useState<Voucher | null>(null);
  const now = useMemo(() => new Date(), []);

  const stats = useMemo(() => {
    const withBalance = vouchers.filter((v) => v.hasBalance);
    const circulacao = withBalance.reduce((s, v) => s + voucherBalanceValue(v), 0);
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const soldThisMonth = vouchers.filter((v) => {
      const d = new Date(v.purchasedAt);
      return v.paid && `${d.getFullYear()}-${d.getMonth()}` === monthKey;
    });
    const recebidoMes = soldThisMonth.reduce((s, v) => s + v.packagePrice, 0);
    const expiringSoon = withBalance.filter((v) => isExpiringSoon(v.expiresAt, now));
    return {
      circulacao,
      circulacaoCount: withBalance.length,
      recebidoMes,
      soldCount: soldThisMonth.length,
      expiringSoon,
    };
  }, [vouchers, now]);

  if (vouchers.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="Nenhum voucher vendido ainda"
        description="Venda um pacote pago adiantado para começar a acompanhar o saldo dos clientes."
        action={
          <Button onClick={onSell} className="rounded-xl font-semibold">
            Vender voucher
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Saldo em circulação"
          value={formatBRL(stats.circulacao)}
          sub={`${stats.circulacaoCount} voucher${stats.circulacaoCount === 1 ? "" : "s"} com itens a retirar`}
        />
        <StatCard
          label="Recebido no mês"
          value={formatBRL(stats.recebidoMes)}
          sub={`${stats.soldCount} voucher${stats.soldCount === 1 ? "" : "s"} vendido${stats.soldCount === 1 ? "" : "s"} este mês`}
        />
        <StatCard
          label="Vencendo em 7 dias"
          value={String(stats.expiringSoon.length)}
          sub={
            stats.expiringSoon[0]
              ? `${stats.expiringSoon[0].customerName} · ${stats.expiringSoon[0].items.find((i) => remaining(i) > 0)?.name ?? ""}`
              : "Nenhum voucher vencendo"
          }
          tone="amber"
        />
      </div>

      <ul className="space-y-3">
        {vouchers.map((v) => {
          const pills = voucherPills(v, now);
          const meta = STATUS_META[pills.status];
          return (
            <li
              key={v.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-mist text-primary">
                  <Ticket className="size-4.5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-ink-faint">
                      #{v.code}
                    </span>
                    <span className="text-[14px] font-bold text-ink">
                      {v.templateName}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                        meta.bg,
                        meta.fg,
                      )}
                    >
                      {meta.label}
                    </span>
                    {pills.noExpiry && (
                      <span className="rounded-full bg-wash px-2 py-0.5 text-[10.5px] font-bold text-ink-faint">
                        Sem validade
                      </span>
                    )}
                    {pills.unpaid && (
                      <span className="rounded-full bg-amber-wash px-2 py-0.5 text-[10.5px] font-bold text-amber">
                        A receber
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    {v.customerName} · comprado {formatDateShort(v.purchasedAt)}
                    {v.expiresAt &&
                      (pills.status === "expirado"
                        ? ` · venceu ${formatDate(v.expiresAt)}`
                        : ` · vence ${formatDate(v.expiresAt)}`)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-[15px] font-bold text-ink">
                    {formatBRL(v.packagePrice)}
                  </p>
                  {v.paid && v.payMethod && (
                    <span className="text-[11px] text-ink-faint">
                      Pago · {PAY_METHOD_META[v.payMethod].label}
                    </span>
                  )}
                </div>
              </div>

              <ul className="mt-3 space-y-2 border-t border-wash pt-3">
                {v.items.map((item) => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-[12.5px] font-medium text-ink-soft">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="tabular text-[11.5px] text-ink-faint">
                        {item.redeemedCount}/{item.qty}
                      </span>
                      <PunchBar total={item.qty} used={item.redeemedCount} />
                    </div>
                  </li>
                ))}
              </ul>

              {v.hasBalance && pills.status !== "expirado" && (
                <div className="mt-3 border-t border-wash pt-3">
                  <Button
                    size="sm"
                    onClick={() => setRedeeming(v)}
                    className="rounded-lg font-semibold"
                  >
                    Registrar retirada
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <RedeemDialog
        storeId={storeId}
        voucher={redeeming}
        open={redeeming !== null}
        onOpenChange={(open) => !open && setRedeeming(null)}
      />
    </>
  );
}
