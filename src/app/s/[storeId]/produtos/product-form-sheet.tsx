"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/types";
import { PRODUCT_CATEGORIES, PRODUCT_TYPE_TAGS } from "@/lib/types";
import { formatBRL, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PRODUCT_CATEGORY_META,
  PRODUCT_TYPE_TAG_LABELS,
} from "@/components/category-meta";

interface ProductFormSheetProps {
  storeId: string;
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductFormSheet({
  storeId,
  product,
  open,
  onOpenChange,
}: ProductFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-[17px] font-bold">
            {product ? "Editar produto" : "Novo produto"}
          </SheetTitle>
        </SheetHeader>
        {/* Keyed so switching between create/edit remounts with fresh state. */}
        <ProductForm
          key={product?.id ?? "new"}
          storeId={storeId}
          product={product}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProductForm({
  storeId,
  product,
  onClose,
}: {
  storeId: string;
  product: Product | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(
    product ? formatBRL(product.price).replace(/R\$\s?/, "") : "",
  );
  const [category, setCategory] = useState<string>(
    product?.category ?? "shakes",
  );
  const [typeTags, setTypeTags] = useState<string[]>(product?.typeTags ?? []);
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [pending, startTransition] = useTransition();

  function submit() {
    let priceCentavos: number;
    try {
      priceCentavos = parseBRL(price);
    } catch {
      toast.error("Preço inválido.");
      return;
    }

    startTransition(async () => {
      const input = {
        storeId,
        name,
        price: priceCentavos,
        category: category as (typeof PRODUCT_CATEGORIES)[number],
        typeTags: typeTags as (typeof PRODUCT_TYPE_TAGS)[number][],
        description: description.trim() || undefined,
        active,
      };
      const result = product
        ? await updateProductAction(product.id, input)
        : await createProductAction(input);
      if (result.ok) {
        toast.success(product ? "Produto atualizado." : "Produto criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    if (!product) return;
    startTransition(async () => {
      const result = await deleteProductAction(storeId, product.id);
      if (result.ok) {
        toast.success("Produto removido.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-5 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="product-name">Nome</Label>
          <Input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bowl de frango com legumes"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-price">Preço</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
              R$
            </span>
            <Input
              id="product-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="29,90"
              inputMode="decimal"
              className="rounded-xl pl-9 tabular"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-description">Descrição</Label>
          <Textarea
            id="product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shake de Morango com Baunilha e borda de Morango…"
            rows={3}
            maxLength={280}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCT_CATEGORIES.map((key) => {
              const meta = PRODUCT_CATEGORY_META[key];
              const Icon = meta.icon;
              const selected = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
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
          <Label>Tipo</Label>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_TYPE_TAGS.map((tag) => {
              const selected = typeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTypeTags(
                      selected
                        ? typeTags.filter((t) => t !== tag)
                        : [...typeTags, tag],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    selected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-ink-soft hover:border-primary/40",
                  )}
                >
                  {PRODUCT_TYPE_TAG_LABELS[tag]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-paper px-3.5 py-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">Ativo</p>
            <p className="text-[11.5px] text-ink-faint">
              Produtos inativos não aparecem em novos pedidos.
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        {product && (
          <Button
            variant="ghost"
            onClick={remove}
            disabled={pending}
            className="w-full gap-1.5 rounded-xl text-destructive hover:bg-danger-wash hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Remover produto
          </Button>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
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
          disabled={pending || !name.trim() || !price.trim()}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </SheetFooter>
    </>
  );
}
