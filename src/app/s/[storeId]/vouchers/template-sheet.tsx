"use client";

import { useState, useTransition } from "react";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Product, VoucherTemplate, VoucherTemplateItem } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { computeSavings } from "@/lib/vouchers";
import { cn } from "@/lib/utils";
import {
  createVoucherTemplateAction,
  setVoucherTemplateActiveAction,
  updateVoucherTemplateAction,
} from "@/actions/vouchers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface TemplateSheetProps {
  storeId: string;
  template: VoucherTemplate | null;
  products: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateSheet({
  storeId,
  template,
  products,
  open,
  onOpenChange,
}: TemplateSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Modelo de voucher
          </p>
          <SheetTitle className="text-[17px] font-bold">
            {template ? template.name : "Novo modelo"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <TemplateForm
            key={template?.id ?? "new"}
            storeId={storeId}
            template={template}
            products={products}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TemplateForm({
  storeId,
  template,
  products,
  onClose,
}: {
  storeId: string;
  template: VoucherTemplate | null;
  products: Product[];
  onClose: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [items, setItems] = useState<VoucherTemplateItem[]>(template?.items ?? []);
  const [packagePrice, setPackagePrice] = useState(
    template ? String(template.packagePrice / 100).replace(".", ",") : "",
  );
  const [validityDays, setValidityDays] = useState(
    template?.validityDays ? String(template.validityDays) : "",
  );
  const [pending, startTransition] = useTransition();

  const priceCentavos = Math.round(
    parseFloat((packagePrice || "0").replace(",", ".")) * 100,
  );
  const { sum, savings, discountPct } = computeSavings(
    items,
    Number.isFinite(priceCentavos) ? priceCentavos : 0,
  );

  function addItem(product: Product) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        return prev.map((i, j) => (j === idx ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        { productId: product.id, name: product.name, unitPrice: product.price, qty: 1 },
      ];
    });
  }

  function changeQty(productId: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
  }

  function submit() {
    const data = {
      storeId,
      name,
      description: description.trim() || undefined,
      items,
      packagePrice: Number.isFinite(priceCentavos) ? priceCentavos : 0,
      validityDays: validityDays.trim() ? Number(validityDays) : null,
    };
    startTransition(async () => {
      const result = template
        ? await updateVoucherTemplateAction(template.id, data)
        : await createVoucherTemplateAction(data);
      if (result.ok) {
        toast.success(template ? "Modelo atualizado." : "Modelo criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleActive() {
    if (!template) return;
    startTransition(async () => {
      const result = await setVoucherTemplateActiveAction({
        storeId,
        templateId: template.id,
        active: !template.active,
      });
      if (result.ok) {
        toast.success(template.active ? "Modelo desativado." : "Modelo reativado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">Nome</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Semana Fit"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tpl-desc">Descrição</Label>
          <Textarea
            id="tpl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Cinco shakes e cinco drinks para a semana."
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Itens do pacote</Label>
            <ProductPicker products={products} onPick={addItem} />
          </div>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-paper px-4 py-4 text-center text-[12px] text-ink-faint">
              Adicione os itens que compõem o pacote.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center gap-3 rounded-xl border border-border bg-paper p-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="tabular block text-[11px] text-ink-faint">
                      {formatBRL(item.unitPrice)} /un
                    </span>
                  </span>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                    <button
                      type="button"
                      onClick={() => changeQty(item.productId, -1)}
                      className="flex size-6 items-center justify-center rounded-md text-ink-soft hover:bg-wash hover:text-primary"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="tabular w-6 text-center text-[13px] font-bold text-ink">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQty(item.productId, 1)}
                      className="flex size-6 items-center justify-center rounded-md text-ink-soft hover:bg-wash hover:text-primary"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-price">Preço do pacote</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                R$
              </span>
              <Input
                id="tpl-price"
                value={packagePrice}
                onChange={(e) => setPackagePrice(e.target.value)}
                placeholder="300,00"
                inputMode="decimal"
                className="rounded-xl pl-9 tabular font-bold text-primary"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-validity">Validade (dias)</Label>
            <Input
              id="tpl-validity"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value.replace(/\D/g, ""))}
              placeholder="Sem validade"
              inputMode="numeric"
              className="rounded-xl"
            />
          </div>
        </div>

        {items.length > 0 && sum > 0 && (
          <div className="rounded-xl border border-mint-wash bg-mist px-3.5 py-2.5 text-[12.5px] text-ink-soft">
            Somando avulso daria{" "}
            <span className="font-semibold text-ink">{formatBRL(sum)}</span>
            {savings > 0 ? (
              <>
                {" "}
                — o pacote entrega{" "}
                <span className="font-semibold text-primary">{discountPct}%</span> de
                desconto.
              </>
            ) : (
              "."
            )}
          </div>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        {template && (
          <Button
            variant="outline"
            onClick={toggleActive}
            disabled={pending}
            className="rounded-xl"
          >
            {template.active ? "Desativar" : "Reativar"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !name.trim() || items.length === 0}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar modelo
        </Button>
      </SheetFooter>
    </>
  );
}

function ProductPicker({
  products,
  onPick,
}: {
  products: Product[];
  onPick: (product: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) => p.name.toLowerCase().includes(q))
    : products;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          + Adicionar item
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center gap-2 border-b border-border bg-paper px-3 py-2.5">
          <Search className="size-4 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPick(p);
                setOpen(false);
                setQuery("");
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-wash",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
                {p.name}
              </span>
              <span className="tabular shrink-0 text-[11.5px] text-ink-faint">
                {formatBRL(p.price)}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-[12px] text-ink-faint">
              Nenhum produto encontrado
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
