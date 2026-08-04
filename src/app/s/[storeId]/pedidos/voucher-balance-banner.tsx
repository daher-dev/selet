"use client";

import { useEffect, useState, useTransition } from "react";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import type { OrderItem, Voucher } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { isExpired, remaining } from "@/lib/vouchers";
import {
  listVouchersByCustomerAction,
  redeemVoucherItemAction,
} from "@/actions/vouchers";
import { Button } from "@/components/ui/button";

interface VoucherBalanceBannerProps {
  storeId: string;
  customerId: string;
  customerName: string;
  /** Adds a zero-price line to the order for the redeemed voucher item. */
  onRedeemed: (item: OrderItem) => void;
}

/**
 * Proactive banner: when the order's customer has an active voucher with
 * unredeemed items, offers a one-click "Usar saldo do voucher" — this both
 * redeems the item (a real, immediate stock/voucher event, not tied to
 * whether this order draft is later saved) and adds a free (unitPrice: 0)
 * line to the order so the total reflects it, per the plan's "simplest
 * version" — no separate discount field on Order.
 */
export function VoucherBalanceBanner({
  storeId,
  customerId,
  customerName,
  onRedeemed,
}: VoucherBalanceBannerProps) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [pending, startTransition] = useTransition();

  // customerId is always non-empty here — the parent only mounts this banner
  // (keyed by customerId, so a switch remounts fresh) once a customer is set.
  useEffect(() => {
    let active = true;
    listVouchersByCustomerAction(storeId, customerId).then((list) => {
      if (active) setVouchers(list);
    });
    return () => {
      active = false;
    };
  }, [storeId, customerId]);

  const offer = vouchers
    .filter((v) => v.hasBalance && !isExpired(v.expiresAt))
    .map((v) => ({ voucher: v, item: v.items.find((i) => remaining(i) > 0) ?? null }))
    .find((o): o is { voucher: Voucher; item: NonNullable<typeof o.item> } => o.item !== null);

  if (!offer) return null;
  const { voucher, item } = offer;

  function redeem() {
    startTransition(async () => {
      const result = await redeemVoucherItemAction({
        storeId,
        voucherId: voucher.id,
        productId: item.productId,
      });
      if (result.ok) {
        toast.success("Retirada registrada no voucher.");
        onRedeemed({
          productId: item.productId,
          name: `${item.name} (Voucher #${voucher.code})`,
          qty: 1,
          unitPrice: 0,
        });
        setVouchers((prev) => prev.filter((v) => v.id !== voucher.id));
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-mint-wash bg-mist px-3.5 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Ticket className="size-4.5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] text-ink-soft">
        <span className="font-semibold text-ink">{customerName}</span> tem voucher
        com saldo — {voucher.templateName} ·{" "}
        {remaining(item)} {item.name} disponível
        {voucher.expiresAt ? ` até ${formatDate(voucher.expiresAt)}` : ""}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={redeem}
        disabled={pending}
        className="shrink-0 rounded-lg border-primary/40 font-semibold text-primary"
      >
        Usar saldo do voucher
      </Button>
    </div>
  );
}
