"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Crown,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
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
import { formatBRL, formatRelative, initials } from "@/lib/format";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** Order-independent signature of an item's adicionais, for merging lines. */
function addonSignature(addons?: string[]): string {
  return [...(addons ?? [])].sort().join("|");
}

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

  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const cancelled = order?.status === "cancelado";

  // productId → Product, so order lines can resolve their category tile.
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  function lineMeta(productId: string): CategoryMeta {
    const cat = productById.get(productId)?.category ?? "";
    return PRODUCT_CATEGORY_META[cat] ?? NEUTRAL_TILE;
  }

  function customerName(): string {
    return customers.find((c) => c.id === customerId)?.name ?? "";
  }

  // A configured line (product + qty + chosen adicionais, price already folded
  // into unitPrice). Merges into an identical existing line — same product AND
  // same set of adicionais — otherwise becomes its own line.
  function addConfiguredItem(item: OrderItem) {
    setItems((prev) => {
      const sig = addonSignature(item.addons);
      const idx = prev.findIndex(
        (i) => i.productId === item.productId && addonSignature(i.addons) === sig,
      );
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
        .map((i, j) => (j === index ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, j) => j !== index));
  }

  function submit() {
    startTransition(async () => {
      const base = {
        storeId,
        customerId,
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
              Nenhum item — toque para adicionar do catálogo.
            </button>
          ) : (
            <ul className="space-y-2.5">
              {items.map((item, index) => {
                const meta = lineMeta(item.productId);
                return (
                  <li
                    key={`${item.productId}-${index}`}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-paper p-3"
                  >
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
                      <span className="tabular ml-auto text-[15px] font-bold text-ink">
                        {formatBRL(item.qty * item.unitPrice)}
                      </span>
                    </div>
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

          <div className="flex items-center justify-between rounded-xl border border-mint-wash bg-mist px-4 py-3">
            <span className="text-[13px] font-semibold text-ink-soft">
              Valor total
            </span>
            <span className="tabular text-[22px] font-bold text-primary">
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
                onClick={() => changePayment(true, payMethod ?? "pix")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  paid
                    ? "border-primary bg-mint-wash text-primary"
                    : "border-border bg-card text-ink-soft",
                )}
              >
                <Check className="size-4" strokeWidth={2.2} />
                Pago
              </button>
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
            !customerId ||
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
        onAdd={addConfiguredItem}
      />
    </>
  );
}

/**
 * Searchable customer picker (design 383-411): a Popover listing each
 * registered customer as avatar + name + phone with a VIP crown, plus a
 * "Nenhum cliente encontrado" empty state. Customer selection is mandatory —
 * there is no walk-in option; the empty/no-results state links to Clientes so
 * staff can register a customer without leaving the flow stuck.
 */
function CustomerPicker({
  storeId,
  customers,
  value,
  onChange,
}: {
  storeId: string;
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = customers.find((c) => c.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.instagram?.toLowerCase().includes(q),
      )
    : customers;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-paper px-3 text-left transition-colors hover:border-primary/40"
        >
          {selected ? (
            <Avatar name={selected.name} vip={selected.tags.includes("vip")} />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-mist text-ink-faint">
              <User className="size-4" />
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px] font-semibold",
              selected ? "text-ink" : "text-ink-faint",
            )}
          >
            {selected ? selected.name : "Selecione um cliente"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <div className="flex items-center gap-2 border-b border-border bg-paper px-3 py-2.5">
          <Search className="size-4 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {filtered.map((c) => {
            const vip = c.tags.includes("vip");
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-wash"
              >
                <Avatar name={c.name} vip={vip} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {c.name}
                  </span>
                  {(c.phone || c.instagram) && (
                    <span className="block truncate text-[11px] text-ink-faint">
                      {c.phone ?? c.instagram}
                    </span>
                  )}
                </span>
                {vip && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-bold text-amber">
                    <Crown className="size-3" />
                    VIP
                  </span>
                )}
                {value === c.id && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-[12.5px] text-ink-faint">
              {q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </div>
          )}
        </div>
        <div className="border-t border-border p-1.5">
          <Link
            href={`/s/${storeId}/clientes`}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-mist"
          >
            <UserPlus className="size-4 shrink-0" />
            Cadastrar cliente
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Avatar({ name, vip }: { name: string; vip: boolean }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        vip ? "bg-amber-wash text-amber" : "bg-mist text-primary",
      )}
    >
      {initials(name)}
    </span>
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
  open,
  onOpenChange,
  onAdd,
}: {
  products: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: OrderItem) => void;
}) {
  const [query, setQuery] = useState("");
  // A picked product moves us from the catalog list to the config step.
  const [config, setConfig] = useState<Product | null>(null);

  function reset() {
    setQuery("");
    setConfig(null);
  }

  function close() {
    onOpenChange(false);
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) => p.name.toLowerCase().includes(q))
    : products;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0">
        {config ? (
          <ProductConfig
            product={config}
            onBack={() => setConfig(null)}
            onConfirm={(item) => {
              onAdd(item);
              toast.success(`${item.name} adicionado.`);
              close();
              reset();
            }}
          />
        ) : (
          <>
            <DialogHeader className="shrink-0 border-b border-border p-4 pb-3">
              <DialogTitle className="text-[15px] font-bold">
                Adicionar ao pedido
              </DialogTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar produto do catálogo…"
                  className="rounded-xl pl-9"
                />
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-[12.5px] text-ink-faint">
                  {products.length === 0
                    ? "Cadastre produtos no Catálogo primeiro."
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Menu vs Revenda tag on catalog rows (design addProductList typeBadge).
function SaleTypeBadge({ saleType }: { saleType: Product["saleType"] }) {
  const revenda = saleType === "revenda";
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide",
        revenda ? "bg-info-wash text-info" : "bg-mist text-primary",
      )}
    >
      {revenda ? "Revenda" : "Menu"}
    </span>
  );
}

/**
 * Config step for a picked product: quantity + optional adicionais. Selected
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
            <Label>Adicionais</Label>
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
