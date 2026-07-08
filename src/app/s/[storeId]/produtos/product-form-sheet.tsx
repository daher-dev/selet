"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Boxes,
  ChefHat,
  Clock,
  Loader2,
  Package,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  PriceTier,
  Product,
  ProductAddon,
  ProductSaleType,
  RecipeItem,
  StockItem,
} from "@/lib/types";
import { PRODUCT_CATEGORIES, PRODUCT_TYPE_TAGS } from "@/lib/types";
import { formatBRL, formatQty, parseBRL } from "@/lib/format";
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
  CategoryTile,
  PRODUCT_CATEGORY_META,
  PRODUCT_TYPE_TAG_LABELS,
  STOCK_CATEGORY_META,
} from "@/components/category-meta";
import { unitLabel, usableAmount } from "../estoque/stock-view";

interface ProductFormSheetProps {
  storeId: string;
  product: Product | null;
  stockItems: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductFormSheet({
  storeId,
  product,
  stockItems,
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
          stockItems={stockItems}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** A recipe/addon row carries a stable id so React keys survive edits. */
interface RecipeRow extends RecipeItem {
  _id: string;
  continuo: boolean;
}
interface AddonRow extends ProductAddon {
  _id: string;
  continuo: boolean;
}
let rowSeq = 0;
const nextId = () => `row-${rowSeq++}`;

function ProductForm({
  storeId,
  product,
  stockItems,
  onClose,
}: {
  storeId: string;
  product: Product | null;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const { byId, byName } = useMemo(() => {
    const byId = new Map<string, StockItem>();
    const byName = new Map<string, StockItem>();
    for (const s of stockItems) {
      byId.set(s.id, s);
      byName.set(s.name.toLowerCase(), s);
    }
    return { byId, byName };
  }, [stockItems]);

  const resolveItem = useMemo(
    () =>
      (ref: { stockItemId?: string; name: string }): StockItem | undefined =>
        (ref.stockItemId ? byId.get(ref.stockItemId) : undefined) ??
        byName.get(ref.name.toLowerCase()),
    [byId, byName],
  );

  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<string>(product?.category ?? "shakes");
  const [saleType, setSaleType] = useState<ProductSaleType>(
    product?.saleType ?? "menu",
  );
  const [typeTags, setTypeTags] = useState<string[]>(product?.typeTags ?? []);
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [stockManaged, setStockManaged] = useState(product?.stockManaged ?? false);
  const [insumoId, setInsumoId] = useState<string | undefined>(product?.insumoId);
  const [recipe, setRecipe] = useState<RecipeRow[]>(
    (product?.recipe ?? []).map((r) => ({
      ...r,
      _id: nextId(),
      continuo: resolveItem(r)?.consumptionMode === "continuo",
    })),
  );
  const [adicionais, setAdicionais] = useState<AddonRow[]>(
    (product?.adicionais ?? []).map((a) => ({
      ...a,
      _id: nextId(),
      continuo: resolveItem(a)?.consumptionMode === "continuo",
    })),
  );
  // Unified tier list — the qty:1 row is the unit price and is removable, so a
  // product can be sold in lote (batch) only.
  const [tiers, setTiers] = useState<{ _id: string; qty: string; price: string }[]>(
    () => {
      const src = product?.tiers?.length
        ? [...product.tiers].sort((a, b) => a.qty - b.qty)
        : [{ qty: 1, price: 0 }];
      return src.map((t) => ({
        _id: nextId(),
        qty: String(t.qty),
        price: t.price ? formatBRL(t.price).replace(/R\$\s?/, "") : "",
      }));
    },
  );
  const [pending, startTransition] = useTransition();

  const isMenu = saleType === "menu";
  const selectedInsumo = insumoId ? byId.get(insumoId) : undefined;

  const usedStockIds = useMemo(
    () =>
      new Set(
        [...recipe, ...adicionais]
          .map((r) => r.stockItemId)
          .filter((x): x is string => Boolean(x)),
      ),
    [recipe, adicionais],
  );

  function addRecipeRow(item: StockItem) {
    const continuo = item.consumptionMode === "continuo";
    setRecipe((rs) => [
      ...rs,
      {
        _id: nextId(),
        stockItemId: item.id,
        name: item.name,
        qty: continuo ? null : 1,
        unit: item.unit,
        continuo,
      },
    ]);
  }
  function addAddonRow(item: StockItem) {
    const continuo = item.consumptionMode === "continuo";
    setAdicionais((rs) => [
      ...rs,
      {
        _id: nextId(),
        stockItemId: item.id,
        name: item.name,
        price: 0,
        qty: continuo ? null : 1,
        unit: item.unit,
        continuo,
      },
    ]);
  }

  function submit() {
    // Parse the unified tier list.
    const parsedTiers: PriceTier[] = tiers
      .map((t) => {
        const qty = parseInt(t.qty, 10);
        let price = 0;
        if (t.price.trim()) {
          try {
            price = parseBRL(t.price);
          } catch {
            price = -1;
          }
        }
        return { qty, price };
      })
      .filter((t) => t.qty >= 1 && t.price > 0)
      .sort((a, b) => a.qty - b.qty);

    if (parsedTiers.length === 0) {
      toast.error("Informe ao menos uma faixa de preço válida.");
      return;
    }
    const unitTier = parsedTiers.find((t) => t.qty === 1);
    const unitPrice = unitTier
      ? unitTier.price
      : Math.round(parsedTiers[0].price / parsedTiers[0].qty);

    if (saleType === "revenda" && !insumoId) {
      toast.error("Selecione o item do estoque a ser revendido.");
      return;
    }

    const cleanRecipe: RecipeItem[] = isMenu
      ? recipe
          .filter((r) => r.name.trim())
          .map((r) => ({
            ...(r.stockItemId ? { stockItemId: r.stockItemId } : {}),
            name: r.name.trim(),
            qty: r.continuo ? null : r.qty,
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
            qty: a.continuo ? null : (a.qty ?? null),
            unit: a.unit?.trim() || undefined,
          }))
      : [];

    startTransition(async () => {
      const input = {
        storeId,
        name,
        price: unitPrice,
        category: category as (typeof PRODUCT_CATEGORIES)[number],
        typeTags: typeTags as (typeof PRODUCT_TYPE_TAGS)[number][],
        description: description.trim() || undefined,
        active,
        saleType,
        recipe: cleanRecipe,
        adicionais: cleanAddons,
        tiers: parsedTiers,
        insumoId: saleType === "revenda" ? insumoId : undefined,
        stockManaged: isMenu ? stockManaged : false,
        prep: isMenu ? (stockManaged ? "lote" : "sob demanda") : undefined,
        duration: product?.duration,
      } as const;
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
              ? "Preparado na loja: consome insumos da base e aceita adicionais."
              : "Um item do estoque vendido diretamente por um novo preço."}
          </p>
        </div>

        {/* -------------------------------------------------- REVENDA insumo */}
        {!isMenu && (
          <div className="space-y-1.5">
            <Label>Produto do estoque</Label>
            <InsumoTriggerPicker
              stockItems={stockItems}
              selected={selectedInsumo}
              onPick={(item) => setInsumoId(item.id)}
            />
            {selectedInsumo && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-paper px-3 py-2 text-[12px]">
                <Package className="size-3.5 text-ink-faint" />
                <span className="text-ink-soft">Em estoque:</span>
                <span className="tabular font-semibold text-ink">
                  {selectedInsumo.continuousUse
                    ? `${usableAmount(selectedInsumo)} ${
                        selectedInsumo.pkgLabel ?? "emb."
                      }`
                    : formatQty(selectedInsumo.qty, unitLabel(selectedInsumo.unit))}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- MENU base */}
        {isMenu && (
          <>
            <InsumoSection
              title="Base"
              rows={recipe}
              stockItems={stockItems}
              usedStockIds={usedStockIds}
              addLabel="Adicionar insumo"
              onAdd={addRecipeRow}
              onRemove={(id) => setRecipe((rs) => rs.filter((r) => r._id !== id))}
              renderRow={(row) => (
                <RecipeRowFields
                  row={row}
                  onQty={(qty) =>
                    setRecipe((rs) =>
                      rs.map((r) => (r._id === row._id ? { ...r, qty } : r)),
                    )
                  }
                />
              )}
            />

            <InsumoSection
              title="Adicionais"
              rows={adicionais}
              stockItems={stockItems}
              usedStockIds={usedStockIds}
              addLabel="Adicionar opcional"
              onAdd={addAddonRow}
              onRemove={(id) =>
                setAdicionais((rs) => rs.filter((r) => r._id !== id))
              }
              renderRow={(row) => (
                <AddonRowFields
                  row={row}
                  onQty={(qty) =>
                    setAdicionais((rs) =>
                      rs.map((r) => (r._id === row._id ? { ...r, qty } : r)),
                    )
                  }
                  onPrice={(price) =>
                    setAdicionais((rs) =>
                      rs.map((r) => (r._id === row._id ? { ...r, price } : r)),
                    )
                  }
                />
              )}
            />

            <div className="space-y-1.5">
              <Label>Produção</Label>
              <div className="grid grid-cols-2 gap-2.5">
                <ProducaoCard
                  active={!stockManaged}
                  onClick={() => setStockManaged(false)}
                  icon={<Clock className="size-[17px]" strokeWidth={1.8} />}
                  title="Sob demanda"
                  desc="Produzido na hora"
                />
                <ProducaoCard
                  active={stockManaged}
                  onClick={() => setStockManaged(true)}
                  icon={<Boxes className="size-[17px]" strokeWidth={1.8} />}
                  title="No estoque"
                  desc="Armazenado no estoque"
                />
              </div>
            </div>
          </>
        )}

        {/* ----------------------------------------------------- price tiers */}
        <div className="space-y-1.5">
          <Label>Faixa de preço</Label>
          <div className="space-y-2">
            {tiers.map((tier) => (
              <TierRow
                key={tier._id}
                qty={tier.qty}
                price={tier.price}
                onQty={(qty) =>
                  setTiers((ts) =>
                    ts.map((t) => (t._id === tier._id ? { ...t, qty } : t)),
                  )
                }
                onPrice={(price) =>
                  setTiers((ts) =>
                    ts.map((t) => (t._id === tier._id ? { ...t, price } : t)),
                  )
                }
                onRemove={() =>
                  setTiers((ts) => ts.filter((t) => t._id !== tier._id))
                }
              />
            ))}
          </div>
          <DashedAddButton
            onClick={() =>
              setTiers((ts) => [...ts, { _id: nextId(), qty: "", price: "" }])
            }
            label="Adicionar faixa"
          />
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
          disabled={pending || !name.trim()}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </SheetFooter>
    </>
  );
}

/* ------------------------------------------------------------ subcomponents */

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

function ProducaoCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-xl border p-3.5 text-left transition-all",
        active
          ? "border-primary bg-mist text-primary shadow-[0_2px_8px_-4px_rgba(24,107,65,.4)]"
          : "border-border bg-paper text-ink-faint hover:border-primary/40",
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span className="text-[13.5px] font-bold">{title}</span>
      </span>
      <span className="mt-2 text-[11.5px] leading-snug opacity-85">{desc}</span>
    </button>
  );
}

/** A titled section (Base / Adicionais) with rows + a toggleable insumo picker. */
function InsumoSection<T extends RecipeRow | AddonRow>({
  title,
  rows,
  stockItems,
  usedStockIds,
  addLabel,
  onAdd,
  onRemove,
  renderRow,
}: {
  title: string;
  rows: T[];
  stockItems: StockItem[];
  usedStockIds: Set<string>;
  addLabel: string;
  onAdd: (item: StockItem) => void;
  onRemove: (id: string) => void;
  renderRow: (row: T) => React.ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div className="space-y-2">
        {rows.map((row) => {
          const cat = findCategory(stockItems, row);
          const meta = cat ? STOCK_CATEGORY_META[cat] : null;
          return (
            <div
              key={row._id}
              className="space-y-2.5 rounded-xl border border-border bg-paper p-3"
            >
              <div className="flex items-center gap-2.5">
                {meta ? (
                  <CategoryTile meta={meta} className="size-8" />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-mist text-primary">
                    <Package className="size-4" strokeWidth={1.7} />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                  {row.name}
                </span>
                <IconRemove onClick={() => onRemove(row._id)} />
              </div>
              {renderRow(row)}
            </div>
          );
        })}
      </div>

      <DashedAddButton onClick={() => setPickerOpen((v) => !v)} label={addLabel} />
      {pickerOpen && (
        <InsumoPicker
          stockItems={stockItems}
          exclude={usedStockIds}
          onPick={(item) => {
            onAdd(item);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function findCategory(
  stockItems: StockItem[],
  ref: { stockItemId?: string; name: string },
): string | null {
  const item =
    (ref.stockItemId
      ? stockItems.find((s) => s.id === ref.stockItemId)
      : undefined) ??
    stockItems.find((s) => s.name.toLowerCase() === ref.name.toLowerCase());
  return item?.category ?? null;
}

function RecipeRowFields({
  row,
  onQty,
}: {
  row: RecipeRow;
  onQty: (qty: number | null) => void;
}) {
  if (row.continuo) return <SemMedicaoChip />;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] text-ink-faint">Quantidade por preparo</span>
      <span className="flex-1" />
      <div className="flex h-9 items-center rounded-lg border border-border bg-card px-2.5">
        <Input
          value={row.qty == null ? "" : String(row.qty)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            onQty(Number.isFinite(n) ? n : 0);
          }}
          inputMode="decimal"
          className="h-8 w-14 border-0 bg-transparent p-0 text-right tabular text-[13.5px] font-bold text-ink shadow-none focus-visible:ring-0"
        />
        <span className="ml-1 whitespace-nowrap text-[12px] text-ink-faint">
          {row.unit}
        </span>
      </div>
    </div>
  );
}

function AddonRowFields({
  row,
  onQty,
  onPrice,
}: {
  row: AddonRow;
  onQty: (qty: number | null) => void;
  onPrice: (price: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {row.continuo ? (
        <SemMedicaoChip />
      ) : (
        <>
          <span className="text-[11.5px] text-ink-faint">Consumo</span>
          <div className="flex h-9 items-center rounded-lg border border-border bg-card px-2.5">
            <Input
              value={row.qty == null ? "" : String(row.qty)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                onQty(Number.isFinite(n) ? n : 0);
              }}
              inputMode="decimal"
              className="h-8 w-12 border-0 bg-transparent p-0 text-right tabular text-[13px] font-bold text-ink shadow-none focus-visible:ring-0"
            />
            <span className="ml-1 whitespace-nowrap text-[12px] text-ink-faint">
              {row.unit}
            </span>
          </div>
        </>
      )}
      <span className="flex-1" />
      <div className="flex h-9 items-center rounded-lg border border-border bg-card px-2.5">
        <span className="text-[12px] text-ink-faint">+ R$</span>
        <Input
          value={row.price ? formatBRL(row.price).replace(/R\$\s?/, "") : ""}
          onChange={(e) => {
            try {
              onPrice(parseBRL(e.target.value || "0"));
            } catch {
              onPrice(0);
            }
          }}
          inputMode="decimal"
          placeholder="0"
          className="h-8 w-14 border-0 bg-transparent p-0 text-right tabular text-[13.5px] font-bold text-primary shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

function SemMedicaoChip() {
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-lg bg-violet-wash px-2.5 py-1.5 text-[11.5px] font-semibold text-violet">
      <Boxes className="size-3" strokeWidth={1.8} />
      sem medição
    </span>
  );
}

/** Inline searchable estoque list used to add a base/adicional insumo. */
function InsumoPicker({
  stockItems,
  exclude,
  onPick,
}: {
  stockItems: StockItem[];
  exclude: Set<string>;
  onPick: (item: StockItem) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const options = stockItems.filter(
    (s) =>
      !s.archived &&
      !exclude.has(s.id) &&
      (!q ||
        s.name.toLowerCase().includes(q) ||
        (STOCK_CATEGORY_META[s.category]?.label ?? s.category)
          .toLowerCase()
          .includes(q)),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-paper px-3 py-2">
        <Search className="size-4 text-ink-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar insumo…"
          className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {options.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-ink-faint">
            Nenhum insumo encontrado
          </div>
        ) : (
          options.map((item) => {
            const meta = STOCK_CATEGORY_META[item.category];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent"
              >
                {meta && <CategoryTile meta={meta} className="size-7" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {item.name}
                  </span>
                  <span className="block truncate text-[11px] text-ink-faint">
                    {meta?.label ?? item.category}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Trigger button + inline list for picking the revenda insumo. */
function InsumoTriggerPicker({
  stockItems,
  selected,
  onPick,
}: {
  stockItems: StockItem[];
  selected: StockItem | undefined;
  onPick: (item: StockItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = selected ? STOCK_CATEGORY_META[selected.category] : null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-paper px-3 text-left transition-colors hover:border-primary/40"
      >
        {meta && <CategoryTile meta={meta} className="size-8" />}
        <span
          className={cn(
            "flex-1 truncate text-[13.5px] font-semibold",
            selected ? "text-ink" : "text-ink-faint",
          )}
        >
          {selected ? selected.name : "Selecionar item do estoque"}
        </span>
        <X
          className={cn(
            "size-4 text-ink-faint transition-transform",
            open ? "rotate-0" : "rotate-45",
          )}
        />
      </button>
      {open && (
        <InsumoPicker
          stockItems={stockItems}
          exclude={new Set()}
          onPick={(item) => {
            onPick(item);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TierRow({
  qty,
  price,
  onQty,
  onPrice,
  onRemove,
}: {
  qty: string;
  price: string;
  onQty: (v: string) => void;
  onPrice: (v: string) => void;
  onRemove: () => void;
}) {
  const unitWord = parseInt(qty, 10) === 1 ? "unidade" : "unidades";
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-11 items-center rounded-xl border border-border bg-paper px-3">
        <Input
          value={qty}
          onChange={(e) => onQty(e.target.value)}
          inputMode="numeric"
          placeholder="1"
          className="h-9 w-8 border-0 bg-transparent p-0 text-center tabular text-[15px] font-bold text-ink shadow-none focus-visible:ring-0"
        />
        <span className="whitespace-nowrap text-[12px] text-ink-faint">
          {unitWord} por
        </span>
      </div>
      <div className="flex h-11 flex-1 items-center rounded-xl border border-border bg-paper px-3">
        <span className="text-[13px] text-ink-faint">R$</span>
        <Input
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          className="h-9 flex-1 border-0 bg-transparent p-0 text-right tabular text-[15px] font-extrabold text-primary shadow-none focus-visible:ring-0"
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
