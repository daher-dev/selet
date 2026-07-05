"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, Minus, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import type {
  Customer,
  Order,
  OrderChannel,
  OrderItem,
  PayMethod,
  Product,
} from "@/lib/types";
import { ORDER_CHANNELS, PAY_METHODS } from "@/lib/types";
import { formatBRL, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createOrderAction,
  setOrderPaymentAction,
  setOrderStatusAction,
  updateOrderAction,
} from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/category-meta";

const WALK_IN = "__walk_in__";

interface OrderSheetProps {
  storeId: string;
  order: Order | null;
  customers: Customer[];
  products: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderSheet({
  storeId,
  order,
  customers,
  products,
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
          <SheetTitle className="flex items-baseline gap-2 text-[17px] font-bold">
            {order ? (
              <>
                Pedido <span className="font-mono text-ink-faint">#{order.code}</span>
              </>
            ) : (
              "Novo pedido"
            )}
          </SheetTitle>
          {order && (
            <p className="text-[11.5px] text-ink-faint">
              Criado {formatRelative(order.createdAt)}
            </p>
          )}
        </SheetHeader>
        <OrderForm
          key={order?.id ?? "new"}
          storeId={storeId}
          order={order}
          customers={customers}
          products={products}
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
  onClose,
}: {
  storeId: string;
  order: Order | null;
  customers: Customer[];
  products: Product[];
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState<string>(
    order?.customerId ?? WALK_IN,
  );
  const [walkInName, setWalkInName] = useState(
    order && !order.customerId ? order.customerName : "",
  );
  const [channel, setChannel] = useState<OrderChannel>(order?.channel ?? "whatsapp");
  const [items, setItems] = useState<OrderItem[]>(order?.items ?? []);
  const [paid, setPaid] = useState(order?.paid ?? false);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(
    order?.payMethod ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const cancelled = order?.status === "cancelado";

  function customerName(): string {
    if (customerId === WALK_IN) return walkInName.trim();
    return customers.find((c) => c.id === customerId)?.name ?? "";
  }

  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          qty: 1,
          unitPrice: product.price,
        },
      ];
    });
  }

  function changeQty(productId: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) =>
          i.productId === productId ? { ...i, qty: i.qty + delta } : i,
        )
        .filter((i) => i.qty > 0),
    );
  }

  function submit() {
    startTransition(async () => {
      const base = {
        storeId,
        customerId: customerId === WALK_IN ? null : customerId,
        customerName: customerName(),
        channel,
        items,
      };
      const result = order
        ? await updateOrderAction(order.id, base)
        : await createOrderAction({ ...base, paid, payMethod });
      if (result.ok) {
        toast.success(order ? "Pedido atualizado." : "Pedido criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
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

  return (
    <>
      <div className="flex-1 space-y-5 p-4">
        {order && (
          <div className="rounded-2xl border border-border bg-paper p-4">
            <StatusStepper
              status={order.status}
              onChange={changeStatus}
              disabled={pending}
            />
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => changeStatus(cancelled ? "novo" : "cancelado")}
              className={cn(
                "mt-3 w-full gap-1.5 rounded-xl text-[12.5px]",
                cancelled
                  ? "text-primary hover:bg-mist hover:text-primary"
                  : "text-ink-faint hover:bg-danger-wash hover:text-destructive",
              )}
            >
              {cancelled ? (
                <>
                  <RotateCcw className="size-4" /> Reabrir pedido
                </>
              ) : (
                <>
                  <Ban className="size-4" /> Cancelar pedido
                </>
              )}
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WALK_IN}>Sem cadastro</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customerId === WALK_IN && (
            <Input
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="Nome do cliente"
              className="rounded-xl"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Canal</Label>
          <div className="grid grid-cols-3 gap-2">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Itens</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="h-7 gap-1 rounded-lg px-2.5 text-[12px] font-semibold"
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>

          {items.length === 0 ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-xl border border-dashed border-border bg-paper px-4 py-6 text-center text-[12.5px] text-ink-faint transition-colors hover:border-primary/40"
            >
              Nenhum item — toque para adicionar do catálogo.
            </button>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="tabular text-[11.5px] text-ink-faint">
                      {formatBRL(item.unitPrice)} un.
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <QtyButton onClick={() => changeQty(item.productId, -1)}>
                      <Minus className="size-3.5" />
                    </QtyButton>
                    <span className="tabular w-7 text-center text-[13px] font-bold text-ink">
                      {item.qty}
                    </span>
                    <QtyButton onClick={() => changeQty(item.productId, 1)}>
                      <Plus className="size-3.5" />
                    </QtyButton>
                  </div>
                  <span className="tabular w-[72px] shrink-0 text-right text-[13px] font-bold text-ink">
                    {formatBRL(item.qty * item.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between rounded-xl bg-mist px-4 py-3">
            <span className="text-[13px] font-semibold text-ink-soft">Total</span>
            <span className="tabular text-[17px] font-bold text-primary">
              {formatBRL(total)}
            </span>
          </div>
        </div>

        {!cancelled && (
          <div className="space-y-2">
            <Label>Pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changePayment(false, null)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  !paid
                    ? "border-amber bg-amber-wash text-amber"
                    : "border-border bg-card text-ink-soft",
                )}
              >
                A pagar
              </button>
              <button
                type="button"
                onClick={() => changePayment(true, payMethod)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  paid
                    ? "border-primary bg-mint-wash text-primary"
                    : "border-border bg-card text-ink-soft",
                )}
              >
                Pago
              </button>
            </div>
            {paid && (
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
          onClick={submit}
          disabled={
            pending ||
            items.length === 0 ||
            !customerName() ||
            (!order && paid && !payMethod)
          }
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {order ? "Salvar alterações" : "Criar pedido"}
        </Button>
      </SheetFooter>

      <ProductPickerDialog
        products={products}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addProduct}
      />
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
      className="flex size-7 items-center justify-center rounded-lg border border-border bg-paper text-ink-soft transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </button>
  );
}

function ProductPickerDialog({
  products,
  open,
  onOpenChange,
  onPick,
}: {
  products: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) => p.name.toLowerCase().includes(q))
    : products;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] w-[calc(100%-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-border p-4 pb-3">
          <DialogTitle className="text-[15px] font-bold">
            Adicionar item
          </DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no catálogo…"
              className="rounded-xl pl-9"
            />
          </div>
        </DialogHeader>
        <div className="overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12.5px] text-ink-faint">
              {products.length === 0
                ? "Cadastre produtos no Catálogo primeiro."
                : "Nada encontrado."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((product) => {
                const meta = PRODUCT_CATEGORY_META[product.category];
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(product);
                        toast.success(`${product.name} adicionado.`);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-paper"
                    >
                      {meta && <CategoryTile meta={meta} className="size-9" />}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                        {product.name}
                      </span>
                      <span className="tabular shrink-0 text-[13px] font-bold text-ink">
                        {formatBRL(product.price)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
