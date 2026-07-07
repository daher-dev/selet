"use client";

import { useState, useTransition } from "react";
import { ChefHat, Loader2, Plus, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type {
  PriceTier,
  Product,
  ProductAddon,
  ProductSaleType,
  RecipeItem,
} from "@/lib/types";
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

/** A recipe/addon row carries a stable id so React keys survive edits. */
interface RecipeRow extends RecipeItem {
  _id: string;
}
interface AddonRow extends ProductAddon {
  _id: string;
}
let rowSeq = 0;
const nextId = () => `row-${rowSeq++}`;

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
  const [category, setCategory] = useState<string>(product?.category ?? "shakes");
  const [saleType, setSaleType] = useState<ProductSaleType>(
    product?.saleType ?? "menu",
  );
  const [typeTags, setTypeTags] = useState<string[]>(product?.typeTags ?? []);
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [stockManaged, setStockManaged] = useState(product?.stockManaged ?? false);
  const [recipe, setRecipe] = useState<RecipeRow[]>(
    (product?.recipe ?? []).map((r) => ({ ...r, _id: nextId() })),
  );
  const [adicionais, setAdicionais] = useState<AddonRow[]>(
    (product?.adicionais ?? []).map((a) => ({ ...a, _id: nextId() })),
  );
  // Lote tiers beyond the unit (qty:1) price, which is driven by the price field.
  const [loteTiers, setLoteTiers] = useState<PriceTier[]>(
    (product?.tiers ?? []).filter((t) => t.qty !== 1),
  );
  const [pending, startTransition] = useTransition();

  const isMenu = saleType === "menu";

  function submit() {
    let priceCentavos: number;
    try {
      priceCentavos = parseBRL(price);
    } catch {
      toast.error("Preço inválido.");
      return;
    }

    const cleanRecipe: RecipeItem[] = isMenu
      ? recipe
          .filter((r) => r.name.trim())
          .map((r) => ({
            ...(r.stockItemId ? { stockItemId: r.stockItemId } : {}),
            name: r.name.trim(),
            qty: r.qty,
            unit: r.unit.trim(),
          }))
      : [];
    const cleanAddons: ProductAddon[] = isMenu
      ? adicionais
          .filter((a) => a.name.trim())
          .map((a) => ({
            ...(a.stockItemId ? { stockItemId: a.stockItemId } : {}),
            name: a.name.trim(),
            price: a.price,
          }))
      : [];
    const tiers: PriceTier[] = [
      { qty: 1, price: priceCentavos },
      ...loteTiers.filter((t) => t.qty > 1 && t.price >= 0),
    ];

    startTransition(async () => {
      const input = {
        storeId,
        name,
        price: priceCentavos,
        category: category as (typeof PRODUCT_CATEGORIES)[number],
        typeTags: typeTags as (typeof PRODUCT_TYPE_TAGS)[number][],
        description: description.trim() || undefined,
        active,
        saleType,
        recipe: cleanRecipe,
        adicionais: cleanAddons,
        tiers,
        insumoId: product?.insumoId,
        stockManaged: isMenu ? stockManaged : false,
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
          <Label htmlFor="product-name">Nome do item</Label>
          <Input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Shake Frutas Vermelhas"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tipo de venda</Label>
          <div className="grid grid-cols-2 gap-2">
            <SaleTypeButton
              active={saleType === "menu"}
              onClick={() => setSaleType("menu")}
              icon={<ChefHat className="size-4" />}
              label="Menu"
            />
            <SaleTypeButton
              active={saleType === "revenda"}
              onClick={() => setSaleType("revenda")}
              icon={<Tag className="size-4" />}
              label="Revenda"
            />
          </div>
          <p className="text-[11.5px] text-ink-faint">
            {isMenu
              ? "Preparado na loja a partir de uma base que consome o estoque."
              : "Item do estoque revendido diretamente, sem preparo."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-price">Preço unitário</Label>
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

        {isMenu && (
          <>
            <div className="space-y-2">
              <Label>Base</Label>
              <div className="space-y-2">
                {recipe.map((row) => (
                  <RecipeRowEditor
                    key={row._id}
                    row={row}
                    onChange={(next) =>
                      setRecipe((rs) =>
                        rs.map((r) => (r._id === row._id ? { ...r, ...next } : r)),
                      )
                    }
                    onRemove={() =>
                      setRecipe((rs) => rs.filter((r) => r._id !== row._id))
                    }
                  />
                ))}
              </div>
              <DashedAddButton
                onClick={() =>
                  setRecipe((rs) => [
                    ...rs,
                    { _id: nextId(), name: "", qty: null, unit: "g" },
                  ])
                }
                label="Adicionar insumo"
              />
            </div>

            <div className="space-y-2">
              <Label>Adicionais</Label>
              <div className="space-y-2">
                {adicionais.map((row) => (
                  <AddonRowEditor
                    key={row._id}
                    row={row}
                    onChange={(next) =>
                      setAdicionais((rs) =>
                        rs.map((r) => (r._id === row._id ? { ...r, ...next } : r)),
                      )
                    }
                    onRemove={() =>
                      setAdicionais((rs) => rs.filter((r) => r._id !== row._id))
                    }
                  />
                ))}
              </div>
              <DashedAddButton
                onClick={() =>
                  setAdicionais((rs) => [
                    ...rs,
                    { _id: nextId(), name: "", price: 0 },
                  ])
                }
                label="Adicionar opcional"
              />
            </div>

            <div className="space-y-2">
              <Label>Faixas de preço (lote)</Label>
              <div className="space-y-2">
                {loteTiers.map((tier, idx) => (
                  <TierRowEditor
                    key={idx}
                    tier={tier}
                    onChange={(next) =>
                      setLoteTiers((ts) =>
                        ts.map((t, i) => (i === idx ? { ...t, ...next } : t)),
                      )
                    }
                    onRemove={() =>
                      setLoteTiers((ts) => ts.filter((_, i) => i !== idx))
                    }
                  />
                ))}
              </div>
              <DashedAddButton
                onClick={() => setLoteTiers((ts) => [...ts, { qty: 2, price: 0 }])}
                label="Adicionar faixa"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-paper px-3.5 py-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">Produção em lote</p>
                <p className="text-[11.5px] text-ink-faint">
                  Produzido em lote e guardado no estoque.
                </p>
              </div>
              <Switch checked={stockManaged} onCheckedChange={setStockManaged} />
            </div>
          </>
        )}

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
          <Label>Restrições</Label>
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

function SaleTypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
        active
          ? "border-primary bg-mist text-primary"
          : "border-border bg-card text-ink-soft hover:border-primary/40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RecipeRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: RecipeRow;
  onChange: (next: Partial<RecipeItem>) => void;
  onRemove: () => void;
}) {
  const measured = row.qty != null;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-paper p-2.5">
      <div className="flex items-center gap-2">
        <Input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Insumo (ex: Shake Herbalife Baunilha)"
          className="h-9 flex-1 rounded-lg bg-card text-[13px]"
        />
        <IconRemove onClick={onRemove} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ qty: measured ? null : 1 })}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
            measured
              ? "border-border bg-card text-ink-soft"
              : "border-primary bg-mist text-primary",
          )}
        >
          {measured ? "Medir" : "Sem medição"}
        </button>
        {measured && (
          <>
            <Input
              value={String(row.qty ?? "")}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                onChange({ qty: Number.isFinite(n) ? n : 0 });
              }}
              inputMode="decimal"
              className="h-9 w-20 rounded-lg bg-card text-right tabular text-[13px]"
            />
            <Input
              value={row.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
              placeholder="g"
              className="h-9 w-16 rounded-lg bg-card text-[13px]"
            />
          </>
        )}
      </div>
    </div>
  );
}

function AddonRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: AddonRow;
  onChange: (next: Partial<ProductAddon>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-paper p-2.5">
      <Input
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Opcional (ex: Protein Crunch)"
        className="h-9 flex-1 rounded-lg bg-card text-[13px]"
      />
      <div className="flex h-9 shrink-0 items-center rounded-lg border border-border bg-card px-2">
        <span className="text-[12px] text-ink-faint">+ R$</span>
        <Input
          value={row.price ? formatBRL(row.price).replace(/R\$\s?/, "") : ""}
          onChange={(e) => {
            try {
              onChange({ price: parseBRL(e.target.value || "0") });
            } catch {
              onChange({ price: 0 });
            }
          }}
          inputMode="decimal"
          placeholder="0"
          className="h-8 w-14 border-0 bg-transparent p-0 text-right tabular text-[13px] font-bold text-primary shadow-none focus-visible:ring-0"
        />
      </div>
      <IconRemove onClick={onRemove} />
    </div>
  );
}

function TierRowEditor({
  tier,
  onChange,
  onRemove,
}: {
  tier: PriceTier;
  onChange: (next: Partial<PriceTier>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-paper p-2.5">
      <Input
        value={String(tier.qty)}
        onChange={(e) => onChange({ qty: Math.max(2, Number(e.target.value) || 2) })}
        inputMode="numeric"
        className="h-9 w-16 rounded-lg bg-card text-center tabular text-[13px]"
      />
      <span className="text-[12px] text-ink-faint">un. por</span>
      <div className="flex h-9 flex-1 items-center rounded-lg border border-border bg-card px-2">
        <span className="text-[12px] text-ink-faint">R$</span>
        <Input
          value={tier.price ? formatBRL(tier.price).replace(/R\$\s?/, "") : ""}
          onChange={(e) => {
            try {
              onChange({ price: parseBRL(e.target.value || "0") });
            } catch {
              onChange({ price: 0 });
            }
          }}
          inputMode="decimal"
          placeholder="0"
          className="h-8 flex-1 border-0 bg-transparent p-0 text-right tabular text-[13px] font-bold text-primary shadow-none focus-visible:ring-0"
        />
      </div>
      <IconRemove onClick={onRemove} />
    </div>
  );
}

function IconRemove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-ink-faint transition-colors hover:border-destructive hover:bg-danger-wash hover:text-destructive"
    >
      <X className="size-4" />
    </button>
  );
}

function DashedAddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card py-2.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Plus className="size-4" />
      {label}
    </button>
  );
}
