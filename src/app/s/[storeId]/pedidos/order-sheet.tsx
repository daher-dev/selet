"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Cartela,
  CartelaUse,
  Customer,
  DiscountKind,
  DiscountReason,
  Order,
  OrderChannel,
  OrderItem,
  PayMethod,
  Product,
  ShakeBase,
  ShakeBrinde,
  ShakeFlavor,
  ShakeMixin,
  ShakeRim,
  ShakeUtensil,
} from "@/lib/types";
import { DISCOUNT_REASONS, ORDER_CHANNELS, PAY_METHODS } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { balanceValue, cartelaCode, coverageFor, remainingUses } from "@/lib/cartelas";
import { orderMoney, type DiscountInput } from "@/lib/order-money";
import { cn } from "@/lib/utils";
import { CustomerPicker } from "@/components/customer-picker";
import { CartelaPunchDots } from "@/components/cartela-punch-dots";
import {
  createOrderAction,
  setOrderPaymentAction,
  setOrderStatusAction,
  updateOrderAction,
} from "@/actions/orders";
import { listCartelasByCustomerAction } from "@/actions/cartelas";
import { ShakeBuilder, type ShakeBrindeOption } from "./shake-builder";
import { CartelaBuilder } from "./cartela-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusStepper } from "@/components/ui/status-stepper";
import { CHANNEL_META, PAY_METHOD_META } from "@/components/order-meta";
import {
  CategoryTile,
  PRODUCT_CATEGORY_META,
  type CategoryMeta,
} from "@/components/category-meta";

const NEUTRAL_TILE: CategoryMeta = {
  label: "Item",
  icon: ShoppingBag,
  fg: "text-ink-soft",
  bg: "bg-mist",
};

const CARTELA_TILE: CategoryMeta = {
  label: "Cartela",
  icon: Ticket,
  fg: "text-amber",
  bg: "bg-amber-wash",
};

/** Placeholder CartelaUse — only `.length` of the array it's filled into ever
 *  matters to the pure helpers, so its own field values are never read. */
const PLACEHOLDER_USE: CartelaUse = {
  orderId: "",
  orderCode: "",
  productName: "",
  at: "",
};

/** Order-independent signature of an item's adicionais, for merging lines. */
function addonSignature(addons?: string[]): string {
  return [...(addons ?? [])].sort().join("|");
}

/** Order-independent signature of a "Montar shake" line's picks, for merging lines. */
function shakeSignature(shake?: OrderItem["shake"]): string {
  if (!shake) return "";
  const rims = [...shake.rims].sort((a, b) => a.modifierId.localeCompare(b.modifierId));
  const mixins = [...shake.mixins].sort((a, b) => a.modifierId.localeCompare(b.modifierId));
  const overrides = [...(shake.utensilOverrides ?? [])].sort((a, b) =>
    a.utensilId.localeCompare(b.utensilId),
  );
  // The chosen brinde (and its own selected addons) is part of what makes a
  // shake line unique — two otherwise-identical shakes with different
  // brindes must NOT collapse into one qty:N line.
  const brinde = shake.brinde
    ? {
        productId: shake.brinde.productId,
        addons: [...(shake.brinde.addons ?? [])].map((a) => a.name).sort(),
      }
    : null;
  // A sorted COPY — never sort in place, `shake.flavorIds` may belong to a
  // live cart item — consistent with rims/mixins/overrides already being
  // sorted by a copy above.
  const flavorIds = [...shake.flavorIds].sort();
  return JSON.stringify({ f: flavorIds, b: shake.baseId, rims, mixins, overrides, brinde });
}

/** "2026-08-05" (input[type=date] value) from an ISO datetime, in local time. */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "15:12" (input[type=time] value) from an ISO datetime, in local time. */
function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

/** Combines the date+time inputs (local time) into an ISO datetime string,
 *  or null while either half is empty/invalid (the picker was cleared). */
function saleDateTimeToISO(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "2026-07-28" -> "28/07", for the "Lançar em {dd/MM}" footer label. */
function formatDDMM(dateInput: string): string {
  const [, mm, dd] = dateInput.split("-");
  return `${dd}/${mm}`;
}

const DISCOUNT_KIND_OPTIONS: { value: DiscountKind; label: string }[] = [
  { value: "flat", label: "R$" },
  { value: "percent", label: "%" },
  { value: "free", label: "Grátis" },
];

const DISCOUNT_REASON_LABEL: Record<DiscountReason, string> = {
  cortesia: "Cortesia",
  "consumo-interno": "Consumo interno",
  combinado: "Combinado",
  "erro-preparo": "Erro no preparo",
};

/** Parses the discount value input against `kind`'s unit: whole 1-100 for
 *  percent, reais (converted to centavos) for flat, always 0 for free. */
function parseDiscountValue(kind: DiscountKind, raw: string): number {
  if (kind === "free") return 0;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return kind === "percent" ? Math.round(n) : Math.round(n * 100);
}

interface OrderSheetProps {
  storeId: string;
  order: Order | null;
  customers: Customer[];
  products: Product[];
  shakeFlavors: ShakeFlavor[];
  shakeBases: ShakeBase[];
  shakeRims: ShakeRim[];
  shakeMixins: ShakeMixin[];
  shakeUtensils: ShakeUtensil[];
  shakeBrindes: ShakeBrinde[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderSheet({
  storeId,
  order,
  customers,
  products,
  shakeFlavors,
  shakeBases,
  shakeRims,
  shakeMixins,
  shakeUtensils,
  shakeBrindes,
  open,
  onOpenChange,
}: OrderSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <span className="block font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {order ? `Pedido #${order.code}` : "Novo pedido"}
          </span>
          <SheetTitle className="text-[19px] font-bold">
            {order ? "Editar pedido" : "Lançar venda"}
          </SheetTitle>
        </SheetHeader>
        <OrderForm
          key={order?.id ?? "new"}
          storeId={storeId}
          order={order}
          customers={customers}
          products={products}
          shakeFlavors={shakeFlavors}
          shakeBases={shakeBases}
          shakeRims={shakeRims}
          shakeMixins={shakeMixins}
          shakeUtensils={shakeUtensils}
          shakeBrindes={shakeBrindes}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function OrderForm({
  storeId,
  order,
  customers,
  products,
  shakeFlavors,
  shakeBases,
  shakeRims,
  shakeMixins,
  shakeUtensils,
  shakeBrindes,
  onClose,
}: {
  storeId: string;
  order: Order | null;
  customers: Customer[];
  products: Product[];
  shakeFlavors: ShakeFlavor[];
  shakeBases: ShakeBase[];
  shakeRims: ShakeRim[];
  shakeMixins: ShakeMixin[];
  shakeUtensils: ShakeUtensil[];
  shakeBrindes: ShakeBrinde[];
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState<string>(
    order?.customerId ?? "",
  );
  // Design defaults a new order's channel to Instagram (openNewOrder).
  const [channel, setChannel] = useState<OrderChannel>(
    order?.channel ?? "instagram",
  );
  const [items, setItems] = useState<OrderItem[]>(order?.items ?? []);
  const [paid, setPaid] = useState(order?.paid ?? false);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(
    order?.payMethod ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Manual order-level discount (Part A.3) — collapsed/expanded UI state kept
  // separate from the resolved DiscountInput so the segmented control and
  // value input can hold half-typed state without constantly reformatting.
  const [discountOpen, setDiscountOpen] = useState(!!order?.discount);
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    order?.discount?.kind ?? "percent",
  );
  const [discountValueInput, setDiscountValueInput] = useState<string>(
    order?.discount
      ? order.discount.kind === "flat"
        ? String(order.discount.value / 100)
        : order.discount.kind === "percent"
          ? String(order.discount.value)
          : ""
      : "",
  );
  const [discountReason, setDiscountReason] = useState<DiscountReason | undefined>(
    order?.discount?.reason,
  );
  const discountInput: DiscountInput | null = discountOpen
    ? {
        kind: discountKind,
        value: parseDiscountValue(discountKind, discountValueInput),
        reason: discountReason,
      }
    : null;

  // Free-text order note (Part A.5) — team-only, never shown in list rows.
  const [notes, setNotes] = useState(order?.notes ?? "");

  // "Data da venda" (Part A.2). Create mode defaults to "Agora" (no createdAt
  // sent, server uses now()); edit mode always shows the date+time row,
  // prefilled from the order's current createdAt and editable.
  const [saleDateMode, setSaleDateMode] = useState<"agora" | "outra">("agora");
  const [saleDate, setSaleDate] = useState<string>(
    isoToDateInput(order?.createdAt ?? new Date().toISOString()),
  );
  const [saleTime, setSaleTime] = useState<string>(
    isoToTimeInput(order?.createdAt ?? new Date().toISOString()),
  );
  const showSaleDateRow = !!order || saleDateMode === "outra";
  const createdAtISO = showSaleDateRow ? saleDateTimeToISO(saleDate, saleTime) : null;

  // Every cartela belonging to the order's customer — fetched lazily
  // (re-fetched whenever the selected customer changes), then
  // filtered/combined client-side for the offer strips below. Unfiltered by
  // status: the "Cartela aplicada" confirmation step needs the full doc even
  // for a cartela this order has already exhausted.
  const [fetchedCartelas, setFetchedCartelas] = useState<Cartela[]>([]);
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    listCartelasByCustomerAction(storeId, customerId)
      .then((list) => {
        if (active) setFetchedCartelas(list);
      })
      // A malformed cartela doc (bad seed/migration data, say) shouldn't take
      // the whole offer strip down silently — same spirit as the action's own
      // "swallow access errors, just hide the strip" contract.
      .catch(() => {
        if (active) setFetchedCartelas([]);
      });
    return () => {
      active = false;
    };
  }, [storeId, customerId]);
  // Derived rather than reset-in-effect: whenever there's no customer (or a
  // fetch for a different one hasn't landed yet), there's nothing to offer.
  const customerCartelas = customerId ? fetchedCartelas : [];

  // Decision #2: saving an order that applied ≥1 cartela use routes through
  // a confirmation step instead of saving immediately.
  const [confirmingCartela, setConfirmingCartela] = useState(false);

  // Per-line "Agora não" dismissals of the cartela offer strip — index-based
  // like every other per-line action here (changeQty, removeItem…), so a
  // dismissal is a soft, session-only hint rather than persisted state.
  const [dismissedOffers, setDismissedOffers] = useState<Set<number>>(new Set());
  function dismissOffer(index: number) {
    setDismissedOffers((prev) => new Set(prev).add(index));
  }

  // Shared order-money.ts computation (Part A, load-bearing): the exact same
  // function the server uses for the persisted total, so this live preview
  // can never diverge from what gets saved.
  const money = orderMoney(items, discountInput);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const coveredUses = items.reduce((s, i) => (i.cartelaUse ? s + i.qty : s), 0);
  const cancelled = order?.status === "cancelado";

  // "Nada a cobrar" (Part A.4) — never a persisted field, always derived from
  // the live total. Pago/A receber are disabled once the total hits zero;
  // Nada a cobrar is disabled everywhere else and is the only valid state at
  // zero — `effectivePaid`/`effectivePayMethod` force that even if the local
  // `paid` toggle still holds a stale "Pago" from before a discount zeroed it.
  const isZeroTotal = money.total === 0;
  const effectivePaid = paid && !isZeroTotal;
  const effectivePayMethod = effectivePaid ? payMethod : null;

  function actionVerb(): string {
    if (order) return "Salvar pedido";
    return saleDateMode === "outra" ? `Lançar em ${formatDDMM(saleDate)}` : "Lançar venda";
  }

  // How many uses of `cartelaId` this order already holds server-side (only
  // relevant when editing — planCartelas reverses this before reapplying).
  function cartelaConsumedByOrder(cartelaId: string): number {
    return order?.cartelaConsumed.find((c) => c.cartelaId === cartelaId)?.uses ?? 0;
  }

  // How many uses of `cartelaId` the current draft's items already spend.
  function cartelaUsesInDraft(cartelaId: string): number {
    return items.reduce(
      (s, i) => (i.cartelaUse?.cartelaId === cartelaId ? s + i.cartelaUse.uses : s),
      0,
    );
  }

  // Real-time balance available to allocate in this draft: the server
  // balance, plus what this same order already holds (about to be reversed
  // and reapplied), minus what the draft has already spent.
  function availableCartelaUses(cartela: Cartela): number {
    return (
      remainingUses(cartela) + cartelaConsumedByOrder(cartela.id) - cartelaUsesInDraft(cartela.id)
    );
  }

  // The single cartela offered across every eligible line — oldest first
  // (FIFO), keeping the offer strip to one cartela at a time.
  const offerCartela =
    [...customerCartelas]
      .filter((c) => c.status !== "cancelada" && availableCartelaUses(c) > 0)
      .sort((a, b) => (a.purchasedAt < b.purchasedAt ? -1 : 1))[0] ?? null;

  function applyCartelaUse(index: number, cartela: Cartela) {
    setItems((prev) =>
      prev.map((it, j) => {
        if (j !== index) return it;
        const coverage = coverageFor(it.unitPrice, cartela.unitValue);
        if (coverage === null) return it; // guard only — the button is disabled first
        return {
          ...it,
          unitPrice: it.unitPrice - coverage,
          cartelaUse: {
            cartelaId: cartela.id,
            code: cartelaCode(cartela.id),
            uses: it.qty,
            covered: coverage,
            listPrice: it.unitPrice,
          },
        };
      }),
    );
  }

  function removeCartelaUse(index: number) {
    setItems((prev) =>
      prev.map((it, j) => {
        if (j !== index || !it.cartelaUse) return it;
        const { cartelaUse, ...rest } = it;
        return { ...rest, unitPrice: cartelaUse.listPrice };
      }),
    );
  }

  // productId → Product, so order lines can resolve their category tile.
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  // The shake builder's brinde options: each ShakeBrinde catalog entry joined
  // once with its LIVE Product (name/price/category/adicionais) — a brinde
  // doc carries no price or recipe of its own. A brinde whose Product isn't
  // in `products` (deleted/inactive) is silently dropped from the picker.
  const brindeOptions = useMemo<ShakeBrindeOption[]>(() => {
    const options: ShakeBrindeOption[] = [];
    for (const b of shakeBrindes) {
      const product = productById.get(b.productId);
      if (!product) continue;
      options.push({
        productId: b.productId,
        name: product.name,
        price: product.price,
        category: product.category,
        adicionais: product.adicionais,
      });
    }
    return options;
  }, [shakeBrindes, productById]);

  function lineMeta(item: OrderItem): CategoryMeta {
    if (item.cartelaSale) return CARTELA_TILE;
    if (item.shake) return PRODUCT_CATEGORY_META.shakes ?? NEUTRAL_TILE;
    const cat = productById.get(item.productId)?.category ?? "";
    return PRODUCT_CATEGORY_META[cat] ?? NEUTRAL_TILE;
  }

  function customerName(): string {
    return customers.find((c) => c.id === customerId)?.name ?? "";
  }

  // A configured line (product + qty + chosen adicionais/shake picks, price
  // already folded into unitPrice). Merges into an identical existing line —
  // same product AND same adicionais (or same shake picks) — otherwise
  // becomes its own line.
  function addConfiguredItem(item: OrderItem) {
    setItems((prev) => {
      // A cartela sale is its own record (soldOnOrderId → one Cartela doc per
      // line) and must never merge into another line — qty always stays 1.
      if (item.cartelaSale) return [...prev, item];
      const sig = item.shake ? shakeSignature(item.shake) : addonSignature(item.addons);
      const idx = prev.findIndex((i) => {
        if (i.productId !== item.productId) return false;
        if (i.cartelaSale) return false;
        return item.shake
          ? shakeSignature(i.shake) === sig
          : addonSignature(i.addons) === sig;
      });
      if (idx >= 0) {
        return prev.map((i, j) =>
          j === idx ? { ...i, qty: i.qty + item.qty } : i,
        );
      }
      return [...prev, item];
    });
  }

  function changeQty(index: number, delta: number) {
    setItems((prev) =>
      prev
        .map((i, j) => {
          if (j !== index) return i;
          const qty = i.qty + delta;
          // A cartela-covered line's uses always equal its qty (one use per
          // unit) — keep them in lockstep as the stepper moves.
          if (i.cartelaUse) return { ...i, qty, cartelaUse: { ...i.cartelaUse, uses: qty } };
          return { ...i, qty };
        })
        .filter((i) => i.qty > 0),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, j) => j !== index));
  }

  function doSubmit(finalItems: OrderItem[]) {
    startTransition(async () => {
      const base = {
        storeId,
        customerId,
        customerName: customerName(),
        channel,
        items: finalItems,
        // null explicitly clears an existing discount on edit (and is a no-op
        // "no discount" on create) — see order-money.ts's shared computation,
        // this is exactly the DiscountInput the live preview above was built
        // from, so the persisted total can never diverge from what was shown.
        discount: discountInput,
        notes: notes.trim(),
        ...(createdAtISO ? { createdAt: createdAtISO } : {}),
      };
      const result = order
        ? await updateOrderAction(order.id, base)
        : await createOrderAction({ ...base, paid: effectivePaid, payMethod: effectivePayMethod });
      if (result.ok) {
        toast.success(order ? "Pedido atualizado." : "Pedido criado.");
        onClose();
      } else {
        toast.error(result.error);
        setConfirmingCartela(false); // surface the error back on the editable form
      }
    });
  }

  // Save button: if the draft applies ≥1 cartela use, the first click opens
  // the "Cartela aplicada" confirmation instead of saving immediately.
  function handleSaveClick() {
    if (!confirmingCartela && items.some((i) => i.cartelaUse)) {
      setConfirmingCartela(true);
      return;
    }
    doSubmit(items);
  }

  // Confirmation step's escape hatch: strip every cartela use (back to full
  // price) and save right away — decision #2's "Não usar cartela".
  function skipCartela() {
    const stripped = items.map((it) => {
      if (!it.cartelaUse) return it;
      const { cartelaUse, ...rest } = it;
      return { ...rest, unitPrice: cartelaUse.listPrice };
    });
    setItems(stripped);
    doSubmit(stripped);
  }

  function changeStatus(status: Order["status"]) {
    if (!order) return;
    startTransition(async () => {
      const result = await setOrderStatusAction({
        storeId,
        orderId: order.id,
        status,
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  function changePayment(nextPaid: boolean, nextMethod: PayMethod | null) {
    setPaid(nextPaid);
    setPayMethod(nextPaid ? nextMethod : null);
    if (!order) return; // create mode: applied on save
    if (nextPaid && !nextMethod) return; // wait for method selection
    startTransition(async () => {
      const result = await setOrderPaymentAction({
        storeId,
        orderId: order.id,
        paid: nextPaid,
        payMethod: nextMethod,
      });
      if (result.ok) {
        toast.success(nextPaid ? "Pagamento registrado." : "Pagamento removido.");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (confirmingCartela) {
    return (
      <>
        <CartelaConfirmStep
          order={order}
          items={items}
          cartelas={customerCartelas}
          discount={discountInput}
          actionLabel={actionVerb()}
          pending={pending}
          onBack={() => setConfirmingCartela(false)}
          onSkip={skipCartela}
          onConfirm={() => doSubmit(items)}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-5 p-4">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <CustomerPicker
            storeId={storeId}
            customers={customers}
            value={customerId}
            onChange={setCustomerId}
          />
          {!customerId && (
            <p className="text-[11.5px] text-ink-faint">
              Selecione um cliente para registrar o pedido.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Canal de venda</Label>
          <div className="grid grid-cols-4 gap-2">
            {ORDER_CHANNELS.map((key) => {
              const meta = CHANNEL_META[key];
              const Icon = meta.icon;
              const selected = channel === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChannel(key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] font-semibold transition-colors",
                    selected
                      ? "border-primary bg-mist text-primary"
                      : "border-border bg-card text-ink-soft hover:border-primary/40",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Data da venda</Label>
          {!order && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSaleDateMode("agora")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  saleDateMode === "agora"
                    ? "border-primary bg-mist text-primary"
                    : "border-border bg-card text-ink-soft hover:border-primary/40",
                )}
              >
                <Clock className="size-3.5" strokeWidth={2.1} />
                Agora
              </button>
              <button
                type="button"
                onClick={() => setSaleDateMode("outra")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  saleDateMode === "outra"
                    ? "border-primary bg-mist text-primary"
                    : "border-border bg-card text-ink-soft hover:border-primary/40",
                )}
              >
                <Calendar className="size-3.5" strokeWidth={2} />
                Outra data
              </button>
            </div>
          )}
          {showSaleDateRow && (
            <div className="flex h-[46px] items-center gap-2.5 rounded-xl border border-primary/40 bg-card px-3">
              <Calendar className="size-4 shrink-0 text-primary" strokeWidth={1.9} />
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="tabular min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-ink outline-none"
              />
              <span className="h-5 w-px shrink-0 bg-border" />
              <input
                type="time"
                value={saleTime}
                onChange={(e) => setSaleTime(e.target.value)}
                className="tabular w-[78px] shrink-0 bg-transparent text-right text-[14px] font-semibold text-ink outline-none"
              />
            </div>
          )}
        </div>

        {order && (
          <div className="space-y-1.5">
            <Label>Status do pedido</Label>
            <div className="pt-1">
              <StatusStepper
                status={order.status}
                onChange={changeStatus}
                disabled={pending}
              />
            </div>
            {!cancelled && (
              <button
                type="button"
                disabled={pending}
                onClick={() => changeStatus("cancelado")}
                className="mx-auto mt-2 block rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-ink-faint transition-colors hover:text-destructive disabled:opacity-50"
              >
                Cancelar pedido
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Itens do pedido</Label>
            {items.length > 0 && (
              <span className="text-[11.5px] text-ink-faint">
                {itemCount} un.
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-xl border border-dashed border-border bg-paper px-4 py-6 text-center text-[12.5px] text-ink-faint transition-colors hover:border-primary/40"
            >
              Nenhum item — toque para adicionar do cardápio.
            </button>
          ) : (
            <ul className="space-y-2.5">
              {items.map((item, index) => {
                const meta = lineMeta(item);
                // A cartela-sale line sells a new cartela — it isn't itself
                // a product a cartela could pay down, so no offer/applied strip.
                const cartelaEligible = !item.cartelaSale;
                return (
                  <li
                    key={`${item.productId}-${index}`}
                    className="overflow-hidden rounded-xl border border-border bg-paper"
                  >
                    <div className="flex flex-col gap-3 p-3">
                      <div className="flex items-start gap-3">
                        <CategoryTile meta={meta} className="size-10" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold leading-tight text-ink">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                            {meta.label}
                          </span>
                          {item.addons && item.addons.length > 0 && (
                            <span className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-soft">
                              <Plus className="size-3 text-primary" strokeWidth={2.4} />
                              {item.addons.join(", ")}
                            </span>
                          )}
                          {item.shake?.brinde && (
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-soft">
                              <span className="shrink-0 rounded-full bg-mint-wash px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                Brinde
                              </span>
                              {item.shake.brinde.name} · {formatBRL(0)}
                            </span>
                          )}
                          {item.shake?.brinde?.addons?.map((addon) => (
                            <span
                              key={addon.name}
                              className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-soft"
                            >
                              + {addon.name} · {formatBRL(addon.price)}
                            </span>
                          ))}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          aria-label="Remover item"
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-danger-wash hover:text-destructive"
                        >
                          <Plus className="size-4 rotate-45" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                          <QtyButton onClick={() => changeQty(index, -1)}>
                            <Minus className="size-3.5" />
                          </QtyButton>
                          <span className="tabular w-7 text-center text-[14px] font-bold text-ink">
                            {item.qty}
                          </span>
                          <QtyButton onClick={() => changeQty(index, 1)}>
                            <Plus className="size-3.5" />
                          </QtyButton>
                        </div>
                        <span className="tabular text-[11.5px] text-ink-faint">
                          {formatBRL(item.unitPrice)} un.
                        </span>
                        {item.cartelaUse ? (
                          <span className="tabular ml-auto text-right">
                            <span className="block text-[15px] font-bold text-primary">
                              {formatBRL(item.qty * item.unitPrice)}
                            </span>
                            <span className="block text-[11.5px] text-ink-faint line-through">
                              {formatBRL(item.qty * item.cartelaUse.listPrice)}
                            </span>
                          </span>
                        ) : (
                          <span className="tabular ml-auto text-[15px] font-bold text-ink">
                            {formatBRL(item.qty * item.unitPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                    {cartelaEligible && item.cartelaUse && (
                      <CartelaAppliedStrip
                        cartelaUse={item.cartelaUse}
                        onRemove={() => removeCartelaUse(index)}
                      />
                    )}
                    {cartelaEligible &&
                      !item.cartelaUse &&
                      offerCartela &&
                      !cancelled &&
                      !dismissedOffers.has(index) && (
                        <CartelaOfferStrip
                          cartela={offerCartela}
                          qty={item.qty}
                          unitPrice={item.unitPrice}
                          available={availableCartelaUses(offerCartela)}
                          onApply={() => applyCartelaUse(index, offerCartela)}
                          onDismiss={() => dismissOffer(index)}
                        />
                      )}
                  </li>
                );
              })}
            </ul>
          )}

          {items.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="h-11 w-full gap-2 rounded-xl border-dashed text-[13px] font-semibold text-ink-soft hover:border-primary/60 hover:text-primary"
            >
              <Plus className="size-4" />
              Adicionar item
            </Button>
          )}

          <div className="space-y-3 rounded-xl border border-mint-wash bg-mist px-4 py-3.5">
            <Label>Valores</Label>
            <div className="flex items-center justify-between text-[12.5px] text-ink-soft">
              <span>Subtotal dos itens</span>
              <span className="tabular font-semibold">{formatBRL(money.subtotal)}</span>
            </div>
            {money.covered > 0 && (
              <div className="flex items-center justify-between text-[12.5px] text-primary">
                <span>
                  Coberto pela cartela · {coveredUses} uso{coveredUses === 1 ? "" : "s"}
                </span>
                <span className="tabular font-semibold">− {formatBRL(money.covered)}</span>
              </div>
            )}
            <DiscountRow
              open={discountOpen}
              kind={discountKind}
              valueInput={discountValueInput}
              reason={discountReason}
              amount={money.discount?.amount ?? 0}
              onOpen={() => setDiscountOpen(true)}
              onRemove={() => {
                setDiscountOpen(false);
                setDiscountValueInput("");
                setDiscountReason(undefined);
              }}
              onKindChange={(kind) => {
                // Only clear the value when the unit actually changes (a
                // typed value means something different per kind) — clicking
                // the already-active segment must not wipe what's typed.
                if (kind !== discountKind) setDiscountValueInput("");
                setDiscountKind(kind);
              }}
              onValueChange={setDiscountValueInput}
              onReasonChange={setDiscountReason}
            />
            <div className="flex items-center gap-2 border-t border-mint-wash/70 pt-2.5">
              <span className="flex-1 text-[13px] font-semibold text-ink-soft">
                Total a pagar
              </span>
              {(money.discount?.amount ?? 0) > 0 && (
                <span className="tabular text-[12px] text-ink-faint line-through">
                  {formatBRL(money.afterCartela)}
                </span>
              )}
              <span className="tabular text-[22px] font-bold text-primary">
                {formatBRL(money.total)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label>Notas</Label>
            <span className="text-[11.5px] text-ink-faint">
              opcional · visível para a equipe
            </span>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Alguma observação sobre este pedido…"
            className="min-h-[78px] resize-none rounded-xl border-border bg-paper text-[13px] placeholder:text-ink-faint/70"
          />
        </div>

        {!cancelled && (
          <div className="space-y-2">
            <Label>Pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isZeroTotal}
                onClick={() => changePayment(true, payMethod ?? "pix")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed",
                  isZeroTotal
                    ? "border-dashed border-border bg-card text-ink-faint/70"
                    : effectivePaid
                      ? "border-primary bg-mint-wash text-primary"
                      : "border-border bg-card text-ink-soft",
                )}
              >
                <Check className="size-4" strokeWidth={2.2} />
                Pago
              </button>
              <button
                type="button"
                disabled={isZeroTotal}
                onClick={() => changePayment(false, null)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed",
                  isZeroTotal
                    ? "border-dashed border-border bg-card text-ink-faint/70"
                    : !effectivePaid
                      ? "border-amber bg-amber-wash text-amber"
                      : "border-border bg-card text-ink-soft",
                )}
              >
                A receber
              </button>
              <button
                type="button"
                disabled={!isZeroTotal}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed",
                  isZeroTotal
                    ? "border-primary/50 bg-mist text-primary"
                    : "border-dashed border-border bg-card text-ink-faint/70",
                )}
              >
                Nada a cobrar
              </button>
            </div>
            {effectivePaid && (
              <div className="grid grid-cols-3 gap-2">
                {PAY_METHODS.map((key) => {
                  const meta = PAY_METHOD_META[key];
                  const Icon = meta.icon;
                  const selected = payMethod === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => changePayment(true, key)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] font-semibold transition-colors",
                        selected
                          ? "border-primary bg-mist text-primary"
                          : "border-border bg-card text-ink-soft hover:border-primary/40",
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.8} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          {order ? "Fechar" : "Cancelar"}
        </Button>
        <Button
          onClick={handleSaveClick}
          disabled={
            pending ||
            items.length === 0 ||
            !customerId ||
            (!order && effectivePaid && !effectivePayMethod) ||
            (showSaleDateRow && !createdAtISO)
          }
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {order ? actionVerb() : `${actionVerb()} · ${formatBRL(money.total)}`}
        </Button>
      </SheetFooter>

      <ProductPickerDialog
        products={products}
        shakeFlavors={shakeFlavors}
        shakeBases={shakeBases}
        shakeRims={shakeRims}
        shakeMixins={shakeMixins}
        shakeUtensils={shakeUtensils}
        shakeBrindes={brindeOptions}
        hasCustomer={!!customerId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdd={addConfiguredItem}
      />
    </>
  );
}

/** Per-item strip offering to apply `cartela` to this line — shown on any
 *  line without a cartelaUse yet. Disabled (decision #1) when the line's
 *  price is below the cartela's unitValue, or when the draft has already
 *  spent the available balance elsewhere. "Agora não" only dismisses the
 *  strip for this line (session-only) without touching the cartela itself. */
function CartelaOfferStrip({
  cartela,
  qty,
  unitPrice,
  available,
  onApply,
  onDismiss,
}: {
  cartela: Cartela;
  qty: number;
  unitPrice: number;
  available: number;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const coverage = coverageFor(unitPrice, cartela.unitValue);
  const enoughBalance = available >= qty;
  const eligible = coverage !== null && enoughBalance;
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t px-3.5 py-2.5",
        eligible ? "border-mint-wash bg-mist" : "border-border bg-wash",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[12px] font-bold",
            eligible ? "text-primary" : "text-ink-faint",
          )}
        >
          Usar cartela #{cartelaCode(cartela.id)} neste item?
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-soft">
          {coverage === null
            ? `Cartela cobre ${formatBRL(cartela.unitValue)} por uso · item custa ${formatBRL(unitPrice)}`
            : enoughBalance
              ? `${qty} uso${qty === 1 ? "" : "s"} cobre ${formatBRL(coverage * qty)} · ${available - qty} livre${available - qty === 1 ? "" : "s"}`
              : `Saldo insuficiente · restam ${available} uso${available === 1 ? "" : "s"} na cartela`}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDismiss}
          className="rounded-lg font-semibold"
        >
          Agora não
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onApply}
          disabled={!eligible}
          className="rounded-lg font-semibold"
        >
          Usar cartela
        </Button>
      </div>
    </div>
  );
}

/** Applied strip — the line is already covered by a cartela use. */
function CartelaAppliedStrip({
  cartelaUse,
  onRemove,
}: {
  cartelaUse: NonNullable<OrderItem["cartelaUse"]>;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-mint-wash bg-mist px-3.5 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-primary">
          Cartela #{cartelaUse.code} · {cartelaUse.uses} uso{cartelaUse.uses === 1 ? "" : "s"}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-soft">
          Cobre {formatBRL(cartelaUse.covered * cartelaUse.uses)}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-[11.5px] font-semibold text-ink-faint transition-colors hover:text-destructive"
      >
        Remover
      </button>
    </div>
  );
}

/**
 * Manual order-level discount row (Part A.3), living in the Valores block
 * after the cartela-coverage row and before the Total divider. Collapsed:
 * a dashed "+ Adicionar desconto" row. Expanded: a R$/%/Grátis segmented
 * control, a value input (hidden for "Grátis"), the live computed amount,
 * and single-select reason chips (all optional, even for "Grátis").
 */
function DiscountRow({
  open,
  kind,
  valueInput,
  reason,
  amount,
  onOpen,
  onRemove,
  onKindChange,
  onValueChange,
  onReasonChange,
}: {
  open: boolean;
  kind: DiscountKind;
  valueInput: string;
  reason: DiscountReason | undefined;
  amount: number;
  onOpen: () => void;
  onRemove: () => void;
  onKindChange: (kind: DiscountKind) => void;
  onValueChange: (value: string) => void;
  onReasonChange: (reason: DiscountReason | undefined) => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-mint-wash bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-mist text-primary">
          <Plus className="size-3.5" strokeWidth={2.2} />
        </span>
        <span className="flex-1 text-[12.5px] font-semibold text-primary">
          Adicionar desconto
        </span>
        <span className="text-[11.5px] text-ink-faint">R$, % ou grátis</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[12.5px] font-bold text-ink">Desconto</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[11.5px] font-semibold text-primary"
        >
          Remover
        </button>
      </div>
      <div className="flex gap-2">
        <div className="flex shrink-0 items-center gap-0.5 rounded-[10px] bg-wash p-[3px]">
          {DISCOUNT_KIND_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onKindChange(value)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                kind === value ? "bg-white text-ink shadow-sm" : "text-ink-soft",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {kind !== "free" && (
          <div className="flex flex-1 items-center gap-2 rounded-[10px] border border-primary/40 px-3 py-1.5">
            <input
              type="number"
              inputMode="decimal"
              min={kind === "percent" ? 1 : 0.01}
              max={kind === "percent" ? 100 : undefined}
              step={kind === "percent" ? 1 : 0.01}
              value={valueInput}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="0"
              className="w-full min-w-0 flex-1 bg-transparent text-[14.5px] font-bold text-ink outline-none tabular"
            />
            <span className="shrink-0 text-[12.5px] text-ink-faint">
              {kind === "percent" ? "%" : "R$"}
            </span>
            <span className="h-5 w-px shrink-0 bg-border" />
            <span className="tabular shrink-0 text-[12.5px] font-semibold text-primary">
              − {formatBRL(amount)}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DISCOUNT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onReasonChange(reason === r ? undefined : r)}
            className={cn(
              "rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
              reason === r
                ? "border-primary/60 bg-mist text-primary"
                : "border-border bg-paper text-ink-soft",
            )}
          >
            {DISCOUNT_REASON_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Decision #2's "Cartela aplicada" confirmation, shown in place of the
 * normal form/footer once ≥1 line in the draft has a cartelaUse and Save is
 * pressed. Mirrors docs/design/Mock Pedidos.dc.html frame 3f: a summary of
 * which lines the cartela paid down, the Subtotal/Cartela/A pagar math, a
 * post-order balance preview per cartela involved, and the "Não usar
 * cartela" escape hatch (decision #2) alongside the real commit action.
 */
function CartelaConfirmStep({
  order,
  items,
  cartelas,
  discount,
  actionLabel,
  pending,
  onBack,
  onSkip,
  onConfirm,
}: {
  order: Order | null;
  items: OrderItem[];
  cartelas: Cartela[];
  discount: DiscountInput | null;
  actionLabel: string;
  pending: boolean;
  onBack: () => void;
  onSkip: () => void;
  onConfirm: () => void;
}) {
  const cartelaItems = items.filter((i) => i.cartelaUse);
  const totalUsesApplied = cartelaItems.reduce((s, i) => s + i.qty, 0);
  // Shared order-money.ts computation (Part A) instead of hand-rolled math —
  // the exact same function the main form's live preview and the server use,
  // so this confirmation step can never disagree with either of them.
  const money = orderMoney(items, discount);
  const subtotal = money.subtotal;
  const coveredByCartela = money.covered;
  const totalToPay = money.total;

  function consumedByOrder(cartelaId: string): number {
    return order?.cartelaConsumed.find((c) => c.cartelaId === cartelaId)?.uses ?? 0;
  }
  function usesInDraft(cartelaId: string): number {
    return cartelaItems.reduce(
      (s, i) => (i.cartelaUse?.cartelaId === cartelaId ? s + i.cartelaUse.uses : s),
      0,
    );
  }
  // A hypothetical Cartela as it would read right after this save — real
  // `.uses.length` swapped for the post-save used count, everything else
  // (totalUses, unitValue…) carried over so the real pure helpers apply.
  function afterSave(cartela: Cartela): Cartela {
    const used = Math.max(
      0,
      cartela.uses.length - consumedByOrder(cartela.id) + usesInDraft(cartela.id),
    );
    return { ...cartela, uses: Array.from({ length: used }, () => PLACEHOLDER_USE) };
  }

  const involvedCartelas = [...new Set(cartelaItems.map((i) => i.cartelaUse!.cartelaId))]
    .map((id) => cartelas.find((c) => c.id === id))
    .filter((c): c is Cartela => !!c);

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[12px] font-semibold text-ink-faint transition-colors hover:text-primary"
        >
          <ChevronLeft className="size-3.5" />
          Voltar e editar
        </button>

        <div className="rounded-xl border border-mint-wash bg-mist px-4 py-3">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-primary">
            Cartela aplicada
          </span>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            {totalUsesApplied} uso{totalUsesApplied === 1 ? "" : "s"} de cartela cobrem parte
            deste pedido.
          </p>
        </div>

        <ul className="space-y-2">
          {cartelaItems.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-paper px-3.5 py-2.5"
            >
              <span className="size-3.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-ink">{item.name}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  {item.qty} uso{item.qty === 1 ? "" : "s"} da cartela
                </span>
              </span>
              <span className="text-right">
                <span className="tabular block text-[13.5px] font-bold text-ink">
                  {formatBRL(item.qty * item.unitPrice)}
                </span>
                <span className="tabular block text-[11.5px] text-ink-faint line-through">
                  {formatBRL(item.qty * (item.cartelaUse?.listPrice ?? 0))}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 rounded-xl border border-border bg-paper px-4 py-3.5">
          <div className="flex items-center justify-between text-[13px] text-ink-soft">
            <span>Subtotal</span>
            <span className="tabular font-semibold">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-[13px] font-semibold text-primary">
            <span>Cartela · {totalUsesApplied} usos</span>
            <span className="tabular">− {formatBRL(coveredByCartela)}</span>
          </div>
          {money.discount && money.discount.amount > 0 && (
            <div className="flex items-center justify-between text-[13px] font-semibold text-primary">
              <span>
                Desconto{money.discount.kind === "percent" ? ` · ${money.discount.value}%` : ""}
              </span>
              <span className="tabular">− {formatBRL(money.discount.amount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-border pt-2.5">
            <span className="text-[13.5px] font-bold text-ink">A pagar agora</span>
            <span className="tabular text-[22px] font-bold text-ink">
              {formatBRL(totalToPay)}
            </span>
          </div>
        </div>

        {involvedCartelas.map((cartela) => {
          const after = afterSave(cartela);
          return (
            <div
              key={cartela.id}
              className="rounded-xl border border-border bg-paper px-4 py-3.5"
            >
              <span className="block text-[12px] text-ink-faint">
                Cartela #{cartelaCode(cartela.id)} depois deste pedido
              </span>
              <div className="mt-2.5 flex items-center gap-3">
                <CartelaPunchDots cartela={after} size="sm" />
                <span className="ml-auto shrink-0 text-[12.5px] font-bold text-primary">
                  {remainingUses(after)} usos · {formatBRL(balanceValue(after))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          onClick={onSkip}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Não usar cartela
        </Button>
        <Button onClick={onConfirm} disabled={pending} className="flex-1 rounded-xl font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {actionLabel} · {formatBRL(totalToPay)}
        </Button>
      </SheetFooter>
    </>
  );
}

function QtyButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-wash hover:text-primary"
    >
      {children}
    </button>
  );
}

function ProductPickerDialog({
  products,
  shakeFlavors,
  shakeBases,
  shakeRims,
  shakeMixins,
  shakeUtensils,
  shakeBrindes,
  hasCustomer,
  open,
  onOpenChange,
  onAdd,
}: {
  products: Product[];
  shakeFlavors: ShakeFlavor[];
  shakeBases: ShakeBase[];
  shakeRims: ShakeRim[];
  shakeMixins: ShakeMixin[];
  shakeUtensils: ShakeUtensil[];
  shakeBrindes: ShakeBrindeOption[];
  /** Gates the "Cartela" tab — a cartela is always sold to a specific customer. */
  hasCustomer: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: OrderItem) => void;
}) {
  const [query, setQuery] = useState("");
  // A picked product moves us from the catalog list to the config step.
  const [config, setConfig] = useState<Product | null>(null);
  const [mode, setMode] = useState<"catalogo" | "shake" | "cartela">("catalogo");

  function reset() {
    setQuery("");
    setConfig(null);
    setMode("catalogo");
  }

  function close() {
    onOpenChange(false);
  }

  // Adicional-type products aren't independently orderable — they only show
  // up as live add-ons inside another product's config step.
  const orderable = products.filter((p) => p.saleType !== "adicional");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? orderable.filter((p) => p.name.toLowerCase().includes(q))
    : orderable;

  function handleAdd(item: OrderItem) {
    onAdd(item);
    toast.success(`${item.name} adicionado.`);
    close();
    reset();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {config ? (
          <ProductConfig
            product={config}
            onBack={() => setConfig(null)}
            onConfirm={handleAdd}
          />
        ) : (
          <>
            {/* Persistent across all 3 tabs — matches design's "Adicionar
                item" drawer (Mock Pedidos.dc.html 3c/3d/3e): the title and
                tab pills never disappear behind a per-tab back button, only
                the body below swaps. */}
            <SheetHeader className="shrink-0 gap-3 border-b border-border p-4 pb-3">
              <SheetTitle className="text-[15px] font-bold">
                Adicionar item
              </SheetTitle>
              <div className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-wash p-1">
                <button
                  type="button"
                  onClick={() => setMode("catalogo")}
                  className={cn(
                    "rounded-md px-3 py-1 text-[12px] font-semibold transition-colors",
                    mode === "catalogo"
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-faint hover:text-ink-soft",
                  )}
                >
                  Cardápio
                </button>
                {shakeFlavors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMode("shake")}
                    className={cn(
                      "rounded-md px-3 py-1 text-[12px] font-semibold transition-colors",
                      mode === "shake"
                        ? "bg-white text-ink shadow-sm"
                        : "text-ink-faint hover:text-ink-soft",
                    )}
                  >
                    Montar shake
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMode("cartela")}
                  disabled={!hasCustomer}
                  title={!hasCustomer ? "Selecione um cliente para montar uma cartela" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    mode === "cartela"
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-faint hover:text-ink-soft disabled:hover:text-ink-faint",
                  )}
                >
                  Cartela
                </button>
              </div>
              {mode === "catalogo" && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar produto do cardápio…"
                    className="rounded-xl pl-9"
                  />
                </div>
              )}
            </SheetHeader>

            {mode === "catalogo" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {filtered.length === 0 ? (
                  <p className="px-2 py-8 text-center text-[12.5px] text-ink-faint">
                    {orderable.length === 0
                      ? "Cadastre produtos no Cardápio primeiro."
                      : "Nenhum produto encontrado"}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {filtered.map((product) => {
                      const meta =
                        PRODUCT_CATEGORY_META[product.category] ?? NEUTRAL_TILE;
                      return (
                        <li key={product.id}>
                          <button
                            type="button"
                            onClick={() => setConfig(product)}
                            className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-paper"
                          >
                            <CategoryTile meta={meta} className="size-9" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold text-ink">
                                {product.name}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5">
                                <span className="text-[11px] text-ink-faint">
                                  {meta.label}
                                </span>
                                <SaleTypeBadge saleType={product.saleType} />
                              </span>
                            </span>
                            <span className="tabular shrink-0 text-[13.5px] font-bold text-primary">
                              {formatBRL(product.price)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {mode === "shake" && (
              <ShakeBuilder
                flavors={shakeFlavors}
                bases={shakeBases}
                rims={shakeRims}
                mixins={shakeMixins}
                utensils={shakeUtensils}
                brindes={shakeBrindes}
                onConfirm={handleAdd}
              />
            )}

            {mode === "cartela" && <CartelaBuilder onConfirm={handleAdd} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Menu vs Revenda vs Adicional tag on catalog rows (design addProductList typeBadge).
function SaleTypeBadge({ saleType }: { saleType: Product["saleType"] }) {
  const style =
    saleType === "revenda"
      ? "bg-info-wash text-info"
      : saleType === "adicional"
        ? "bg-violet-wash text-violet"
        : "bg-mist text-primary";
  const label =
    saleType === "revenda" ? "Revenda" : saleType === "adicional" ? "Adicional" : "Menu";
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide",
        style,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Config step for a picked product: quantity + optional opcionais. Selected
 * add-on prices fold into the item's unitPrice so downstream order math is
 * untouched; their names ride along on OrderItem.addons.
 */
function ProductConfig({
  product,
  onBack,
  onConfirm,
}: {
  product: Product;
  onBack: () => void;
  onConfirm: (item: OrderItem) => void;
}) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const meta = PRODUCT_CATEGORY_META[product.category] ?? NEUTRAL_TILE;
  const addons = product.adicionais ?? [];

  function toggleAddon(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  const addonsTotal = addons
    .filter((a) => selected.includes(a.name))
    .reduce((s, a) => s + a.price, 0);
  const unitPrice = product.price + addonsTotal;
  const subtotal = qty * unitPrice;

  function confirm() {
    onConfirm({
      productId: product.id,
      name: product.name,
      qty,
      unitPrice,
      ...(selected.length > 0 ? { addons: selected } : {}),
    });
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-paper text-ink-soft transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <DialogTitle className="min-w-0 flex-1 truncate text-[15px] font-bold">
            {product.name}
          </DialogTitle>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-paper p-3">
          <CategoryTile meta={meta} className="size-11" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">
              {product.name}
            </span>
            <span className="tabular text-[11.5px] text-ink-faint">
              {meta.label} · {formatBRL(product.price)}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <Label>Quantidade</Label>
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-0.5">
            <QtyButton onClick={() => setQty((v) => Math.max(1, v - 1))}>
              <Minus className="size-3.5" />
            </QtyButton>
            <span className="tabular w-8 text-center text-[15px] font-bold text-ink">
              {qty}
            </span>
            <QtyButton onClick={() => setQty((v) => v + 1)}>
              <Plus className="size-3.5" />
            </QtyButton>
          </div>
        </div>

        {addons.length > 0 && (
          <div className="space-y-2">
            <Label>Opcionais</Label>
            <div className="space-y-2">
              {addons.map((addon) => {
                const active = selected.includes(addon.name);
                return (
                  <button
                    key={addon.name}
                    type="button"
                    onClick={() => toggleAddon(addon.name)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-mist"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-paper text-transparent",
                      )}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {addon.name}
                    </span>
                    <span className="tabular shrink-0 text-[12.5px] font-bold text-primary">
                      + {formatBRL(addon.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-ink-faint">
            Subtotal
          </span>
          <span className="tabular text-[20px] font-bold text-primary">
            {formatBRL(subtotal)}
          </span>
        </span>
        <Button
          onClick={confirm}
          className="h-11 gap-1.5 rounded-xl px-5 font-semibold"
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </>
  );
}
