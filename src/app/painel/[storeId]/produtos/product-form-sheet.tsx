"use client";

import { useProductCategories, useProductCategoryMeta } from "@/components/product-settings-context";
import { useMemo, useState, useTransition } from "react";
import {
  Boxes,
  Box,
  ChefHat,
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
  RecipeItem,
  StockItem,
} from "@/lib/types";
import { PRODUCT_TYPE_TAGS } from "@/lib/types";
import { productKind } from "@/lib/product-offers";
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
  PRODUCT_TYPE_TAG_ICONS,
  PRODUCT_TYPE_TAG_LABELS,
} from "@/components/category-meta";
import { usableAmount } from "../estoque/stock-view";
import { useStockCategoryMeta, useUnits } from "@/components/stock-settings-context";

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
        <SheetHeader className="gap-0 border-b border-border">
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-leaf">
            {product ? "Editar item" : "Novo item"}
          </span>
          <SheetTitle className="text-[19px] font-bold">
            {product ? product.name : "Novo produto"}
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
/** An editable price-tier row (string inputs; parsed to PriceTier on submit). */
interface TierRowState {
  _id: string;
  qty: string;
  price: string;
}
let rowSeq = 0;
const nextId = () => `row-${rowSeq++}`;

function tiersToRows(tiers: PriceTier[] | undefined): TierRowState[] {
  if (!tiers?.length) return [];
  return [...tiers]
    .sort((a, b) => a.qty - b.qty)
    .map((t) => ({
      _id: nextId(),
      qty: String(t.qty),
      price: t.price ? formatBRL(t.price).replace(/R\$\s?/, "") : "",
    }));
}

/** Parses tier rows the same way the top-level product tier list is parsed. */
function parseTierRows(rows: TierRowState[]): PriceTier[] {
  return rows
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
}

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
  const PRODUCT_CATEGORY_META = useProductCategoryMeta();
  const productCategories = useProductCategories();
  const { unitLabel } = useUnits();
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
  const [category, setCategory] = useState<string>(
    productCategories.some((c) => c.id === product?.category) ? product!.category : productCategories[0].id,
  );
  // What the item IS: a stock item sold as-is ("estoque": by whole package
  // and/or by single dose) or something prepared from a recipe ("receita").
  // Stored as the sale/resale offers; each way of selling keeps its own price
  // and commission.
  const [kind, setKind] = useState<"estoque" | "receita">(product ? productKind(product) : "estoque");
  const [packOn, setPackOn] = useState(product ? Boolean(product.resale) : true);
  const [doseOn, setDoseOn] = useState(
    product ? Boolean(product.sale) && productKind(product) === "estoque" : false,
  );
  const hasSale = kind === "receita" || doseOn;
  const hasResale = kind === "estoque" && packOn;
  const [typeTags, setTypeTags] = useState<string[]>(product?.typeTags ?? []);
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  // Seller commission per offer: switch + % (string while typing, e.g. "5" / "7,5").
  const pctText = (n?: number) => (n ? String(n).replace(".", ",") : "");
  const [saleCommissionOn, setSaleCommissionOn] = useState((product?.sale?.commissionPercent ?? 0) > 0);
  const [saleCommissionPct, setSaleCommissionPct] = useState(pctText(product?.sale?.commissionPercent));
  const [resaleCommissionOn, setResaleCommissionOn] = useState((product?.resale?.commissionPercent ?? 0) > 0);
  const [resaleCommissionPct, setResaleCommissionPct] = useState(pctText(product?.resale?.commissionPercent));
  const [insumoId, setInsumoId] = useState<string | undefined>(
    product?.resale?.insumoId ||
      (product && productKind(product) === "estoque" ? product.sale?.recipe[0]?.stockItemId : undefined) ||
      undefined,
  );
  // Quantity of the stock item one dose takes (null = "sem medição" items).
  const [doseQty, setDoseQty] = useState<number | null>(
    product && productKind(product) === "estoque" ? (product.sale?.recipe[0]?.qty ?? null) : 1,
  );
  const [recipe, setRecipe] = useState<RecipeRow[]>(
    (product && productKind(product) === "receita" ? (product.sale?.recipe ?? product.recipe ?? []) : []).map((r) => ({
      ...r,
      _id: nextId(),
      continuo: resolveItem(r)?.consumptionMode === "continuo",
    })),
  );
  // Opcionais are no longer edited here (add-ons live in Shakes/Pudim); existing
  // ones on older products are kept untouched on save.
  const storedAddons = (product?.sale?.adicionais ?? product?.adicionais ?? []) as (ProductAddon & { stockItemId: string })[];
  // Unified tier list — the qty:1 row is the unit price and is removable, so a
  // product can be sold in lote (batch) only.
  const [tiers, setTiers] = useState<TierRowState[]>(() =>
    product?.sale?.tiers?.length
      ? tiersToRows(product.sale.tiers)
      : [{ _id: nextId(), qty: "1", price: "" }],
  );
  const [resaleTiers, setResaleTiers] = useState<TierRowState[]>(() =>
    product?.resale?.tiers?.length
      ? tiersToRows(product.resale.tiers)
      : [{ _id: nextId(), qty: "1", price: "" }],
  );
  const [pending, startTransition] = useTransition();

  // Ways of selling a stock item: at least one stays on.
  function togglePack() {
    if (packOn && !doseOn) return;
    setPackOn(!packOn);
  }
  function toggleDose() {
    if (doseOn && !packOn) return;
    setDoseOn(!doseOn);
  }

  const selectedInsumo = insumoId ? byId.get(insumoId) : undefined;
  const doseContinuo = selectedInsumo?.consumptionMode === "continuo";
  const doseRow: RecipeRow | null = selectedInsumo
    ? {
        _id: "dose",
        stockItemId: selectedInsumo.id,
        name: selectedInsumo.name,
        qty: doseContinuo ? null : doseQty,
        unit: selectedInsumo.unit,
        continuo: doseContinuo,
      }
    : null;
  const usedInRecipe = useMemo(
    () =>
      new Set(recipe.map((r) => r.stockItemId).filter((x): x is string => Boolean(x))),
    [recipe],
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
  function submit() {
    const saleTiers = hasSale ? parseTierRows(tiers) : [];
    const packTiers = hasResale ? parseTierRows(resaleTiers) : [];
    if ((hasSale && saleTiers.length === 0) || (hasResale && packTiers.length === 0)) {
      toast.error("Informe ao menos uma faixa de preço válida.");
      return;
    }
    if (kind === "estoque" && !insumoId) {
      toast.error("Selecione o item do estoque.");
      return;
    }
    if (kind === "estoque" && doseOn && doseRow && !doseRow.continuo && !(doseRow.qty && doseRow.qty > 0)) {
      toast.error("Informe a quantidade do item por dose.");
      return;
    }
    // Each offer has its own commission rate (switch off = none).
    const saleCommission = saleCommissionOn && hasSale ? parsePercent(saleCommissionPct) : 0;
    if (saleCommissionOn && hasSale && saleCommission <= 0) {
      toast.error("Informe o percentual da comissão (entre 0 e 100).");
      return;
    }
    const resaleCommission = resaleCommissionOn && hasResale ? parsePercent(resaleCommissionPct) : 0;
    if (resaleCommissionOn && hasResale && resaleCommission <= 0) {
      toast.error("Informe o percentual da comissão da embalagem (entre 0 e 100).");
      return;
    }

    const cleanRecipe: RecipeItem[] = !hasSale
      ? []
      : kind === "estoque"
        ? doseRow
          ? [{ stockItemId: doseRow.stockItemId, name: doseRow.name, qty: doseRow.qty, unit: doseRow.unit }]
          : []
        : recipe
          .filter((r) => r.name.trim())
          .map((r) => ({
            ...(r.stockItemId ? { stockItemId: r.stockItemId } : {}),
            name: r.name.trim(),
            qty: r.continuo ? null : r.qty,
            unit: r.unit.trim(),
          }));
    // Every insumo/opcional must trace to a real Estoque item — no more
    // "topping, no stock link" catalog holes (see actions/products.ts's
    // productSchema, which enforces the same rule server-side).
    if (hasSale && cleanRecipe.length === 0) {
      toast.error("Adicione ao menos um insumo à base.");
      return;
    }
    const unlinkedRecipe = cleanRecipe.find((r) => !r.stockItemId);
    if (unlinkedRecipe) {
      toast.error(`"${unlinkedRecipe.name}" precisa estar vinculado a um item do estoque.`);
      return;
    }
    // Narrow to the action's required-stockItemId shape — a formality for TS,
    // since the checks above already guarantee every row has one.
    const linkedRecipe = cleanRecipe.filter(
      (r): r is RecipeItem & { stockItemId: string } => Boolean(r.stockItemId),
    );

    startTransition(async () => {
      const input = {
        storeId,
        name,
        category,
        typeTags: typeTags as (typeof PRODUCT_TYPE_TAGS)[number][],
        description: description.trim() || undefined,
        active,
        sale: hasSale
          ? {
              recipe: linkedRecipe,
              adicionais: storedAddons,
              tiers: saleTiers,
              ...(saleCommission > 0 ? { commissionPercent: saleCommission } : {}),
            }
          : undefined,
        resale:
          hasResale && insumoId
            ? {
                insumoId,
                tiers: packTiers,
                ...(resaleCommission > 0 ? { commissionPercent: resaleCommission } : {}),
              }
            : undefined,
        adicional: false,
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
            {productCategories.map(({ id: key }) => {
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
          <Label>O que é este item?</Label>
          <div className="grid grid-cols-2 gap-2">
            <SaleTypeButton
              active={kind === "estoque"}
              onClick={() => setKind("estoque")}
              icon={<Package className="size-4" />}
              label="Item do estoque"
            />
            <SaleTypeButton
              active={kind === "receita"}
              onClick={() => setKind("receita")}
              icon={<ChefHat className="size-4" />}
              label="Receita"
            />
          </div>
          <p className="text-[11.5px] text-ink-faint">
            {kind === "estoque"
              ? "Um item do estoque vendido como está — fechado, avulso (dose) ou os dois."
              : "Feito na loja com uma receita de vários insumos."}
          </p>
        </div>

        {kind === "estoque" && (
          <>
            <div className="space-y-1.5">
              <Label>Item do estoque</Label>
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

            <div className="space-y-1.5">
              <Label>Formas de venda</Label>
              <div className="grid grid-cols-2 gap-2">
                <SaleTypeButton
                  active={packOn}
                  onClick={togglePack}
                  icon={<Box className="size-4" />}
                  label="Embalagem fechada"
                />
                <SaleTypeButton
                  active={doseOn}
                  onClick={toggleDose}
                  icon={<Tag className="size-4" />}
                  label="Dose avulsa"
                />
              </div>
            </div>

            {packOn && (
              <OfferCard
                icon={<Box className="size-[18px]" />}
                title="Embalagem fechada"
                hint="Cada venda baixa uma embalagem lacrada do estoque."
              >
                <TierEditor
                  label="Preço por embalagem"
                  tiers={resaleTiers}
                  setTiers={setResaleTiers}
                  firstId={doseOn ? undefined : "product-price"}
                />
                <CommissionField
                  id="product-commission-resale"
                  title="Comissão na embalagem fechada"
                  on={resaleCommissionOn}
                  onToggle={setResaleCommissionOn}
                  percent={resaleCommissionPct}
                  onPercent={setResaleCommissionPct}
                  tiers={parseTierRows(resaleTiers)}
                />
              </OfferCard>
            )}

            {doseOn && (
              <OfferCard
                icon={<Tag className="size-[18px]" />}
                title="Dose avulsa"
                hint="Cada venda tira uma dose do pacote aberto."
              >
                {doseRow ? (
                  <div className="space-y-1.5">
                    <Label>Quantidade por dose</Label>
                    <div className="rounded-xl border border-border bg-paper px-3 py-2.5">
                      <RecipeRowFields row={doseRow} label="Cada dose usa" onQty={setDoseQty} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-faint">Selecione o item do estoque acima para definir a dose.</p>
                )}
                <TierEditor
                  label="Preço por dose"
                  tiers={tiers}
                  setTiers={setTiers}
                  firstId="product-price"
                />
                <CommissionField
                  id="product-commission-sale"
                  title="Comissão na dose avulsa"
                  on={saleCommissionOn}
                  onToggle={setSaleCommissionOn}
                  percent={saleCommissionPct}
                  onPercent={setSaleCommissionPct}
                  tiers={parseTierRows(tiers)}
                />
              </OfferCard>
            )}
          </>
        )}

        {kind === "receita" && (
          <OfferCard
            icon={<ChefHat className="size-[18px]" />}
            title="Receita"
            hint="Feita na loja: cada venda consome os insumos da receita do pacote aberto."
          >
            <InsumoSection
              title="Receita (por unidade)"
              rows={recipe}
              stockItems={stockItems}
              usedStockIds={usedInRecipe}
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
            <TierEditor label="Preço" tiers={tiers} setTiers={setTiers} firstId="product-price" />
            <CommissionField
              id="product-commission-sale"
              title="Comissão do vendedor"
              on={saleCommissionOn}
              onToggle={setSaleCommissionOn}
              percent={saleCommissionPct}
              onPercent={setSaleCommissionPct}
              tiers={parseTierRows(tiers)}
            />
          </OfferCard>
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
              const TagIcon = PRODUCT_TYPE_TAG_ICONS[tag];
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
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    selected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-ink-soft hover:border-primary/40",
                  )}
                >
                  {TagIcon && <TagIcon className="size-3.5" strokeWidth={1.8} aria-hidden />}
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

/** The Base (recipe) section: rows + a toggleable insumo picker. */
function InsumoSection({
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
  rows: RecipeRow[];
  stockItems: StockItem[];
  usedStockIds: Set<string>;
  addLabel: string;
  onAdd: (item: StockItem) => void;
  onRemove: (id: string) => void;
  renderRow: (row: RecipeRow) => React.ReactNode;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
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
  label = "Quantidade por preparo",
}: {
  row: RecipeRow;
  onQty: (qty: number | null) => void;
  label?: string;
}) {
  if (row.continuo) return <SemMedicaoChip />;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] text-ink-faint">{label}</span>
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
  const STOCK_CATEGORY_META = useStockCategoryMeta();
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

/**
 * Merged searchable picker for an opcional row: existing "adicional" catalog
 * products (quick-fill template — name+price+stockItemId copied once) plus
 * raw estoque items, matching how the mockup unifies both into one list.
 */
function InsumoTriggerPicker({
  stockItems,
  selected,
  onPick,
}: {
  stockItems: StockItem[];
  selected: StockItem | undefined;
  onPick: (item: StockItem) => void;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
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

/** One offer's fields grouped in a single card, so Menu and Revenda never mix. */
function OfferCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4">
      <header className="flex items-start gap-3 border-b border-border pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-ink">{title}</h3>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** Editable list of price tiers (qty → price) for one offer. */
function TierEditor({
  label,
  tiers,
  setTiers,
  firstId,
}: {
  label: string;
  tiers: TierRowState[];
  setTiers: React.Dispatch<React.SetStateAction<TierRowState[]>>;
  firstId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="space-y-2">
        {tiers.map((tier, i) => (
          <TierRow
            key={tier._id}
            qty={tier.qty}
            price={tier.price}
            priceId={i === 0 ? firstId : undefined}
            onQty={(qty) => setTiers((ts) => ts.map((t) => (t._id === tier._id ? { ...t, qty } : t)))}
            onPrice={(price) => setTiers((ts) => ts.map((t) => (t._id === tier._id ? { ...t, price } : t)))}
            onRemove={() => setTiers((ts) => ts.filter((t) => t._id !== tier._id))}
          />
        ))}
      </div>
      <DashedAddButton
        onClick={() => setTiers((ts) => [...ts, { _id: nextId(), qty: "", price: "" }])}
        label="Adicionar faixa"
      />
    </div>
  );
}

function TierRow({
  qty,
  price,
  onQty,
  onPrice,
  onRemove,
  priceId,
}: {
  qty: string;
  price: string;
  onQty: (v: string) => void;
  onPrice: (v: string) => void;
  onRemove: () => void;
  /** Stable anchor for the qty:1 unit-price row — the product's "own" price
   *  from the pre-tiers era, still relied on by e2e (see e2e/app.spec.ts). */
  priceId?: string;
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
          id={priceId}
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

/** "7,5" / "5" → 7.5 / 5 (0 when empty or out of 0-100), 2 decimals at most. */
function parsePercent(raw: string): number {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 0;
  return Math.round(n * 100) / 100;
}

/** "Comissão do vendedor" (Mock Cardápio 2a/2b): off by default; shows the value per price tier. */
function CommissionField({
  id,
  title,
  on,
  onToggle,
  percent,
  onPercent,
  tiers,
}: {
  id: string;
  title: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  percent: string;
  onPercent: (value: string) => void;
  tiers: PriceTier[];
}) {
  const pct = parsePercent(percent);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-ink-soft">
            {title}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-soft">
            Opcional · parte do valor vai para quem fez a venda
          </p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={onToggle}
          aria-label={`Pagar ${title.toLowerCase()}`}
        />
      </div>
      {on ? (
        <div className="space-y-2.5 rounded-xl border border-commission-line bg-commission-soft p-3.5">
          <div className="flex items-center gap-2.5">
            <Label
              htmlFor={id}
              className="flex-1 text-[13px] font-semibold text-ink-soft"
            >
              Percentual sobre o valor vendido
            </Label>
            <div className="flex h-10 w-24 items-center rounded-[10px] border border-commission-line bg-white px-3">
              <input
                id={id}
                inputMode="decimal"
                value={percent}
                onChange={(e) => onPercent(e.target.value.replace(/[^\d,.]/g, ""))}
                aria-label={`Percentual de ${title.toLowerCase()}`}
                className="min-w-0 flex-1 border-0 bg-transparent text-right text-[15px] font-bold text-ink outline-none"
              />
              <span className="ml-1 text-sm font-bold text-commission">%</span>
            </div>
          </div>
          {pct > 0 && tiers.length > 0 && (
            <div className="space-y-1 text-[12.5px] text-ink-soft">
              {tiers.map((t) => (
                <p key={t.qty} className="flex">
                  <span className="flex-1">
                    {t.qty === 1
                      ? `1 unidade a ${formatBRL(t.price)}`
                      : `Faixa de ${t.qty} a ${formatBRL(t.price)}`}
                  </span>
                  <strong className="font-bold tabular-nums text-commission">
                    {formatBRL(Math.round((t.price * pct) / 100))}
                  </strong>
                </p>
              ))}
            </div>
          )}
          <p className="text-[11.5px] leading-snug text-ink-soft">
            Com desconto no pedido, a comissão sai do valor com desconto. Cortesia não gera
            comissão.
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-soft">Desligada: ninguém recebe comissão neste modo.</p>
      )}
    </div>
  );
}
