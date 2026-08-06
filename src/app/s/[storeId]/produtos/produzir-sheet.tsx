"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Minus, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Product, StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { produceBatchAction } from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";
import { isFrac, usableAmount } from "../estoque/stock-view";

/**
 * "Produção em lote" sheet. Given a menu recipe and a porção count, it previews
 * the per-insumo stock consumption (need vs available, red/green) and detects
 * shortages — mirroring the design's live "Consumo previsto" panel — then
 * commits a batch through `produceBatchAction`: consume recipe insumos and bump
 * the product's finished-goods count (producedStock). Consumption is best-effort
 * (short stock is clamped, not blocked), so confirm stays enabled even when the
 * simulation flags a shortage; the shortage is surfaced afterward as a warning.
 */
export function ProduzirSheet({
  storeId,
  product,
  stockItems,
  open,
  onOpenChange,
}: {
  storeId: string;
  product: Product | null;
  stockItems: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        {product && (
          <ProduzirBody
            key={product.id}
            storeId={storeId}
            product={product}
            stockItems={stockItems}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface SimLine {
  key: string;
  name: string;
  category: string | null;
  needLabel: string;
  ok: boolean;
  /** Shortfall note shown on the line when `!ok` (e.g. "faltam 80 g"). */
  shortLabel?: string;
  /** Max qty producible without going negative on this insumo (measured shortages only). */
  maxQty?: number;
}

function ProduzirBody({
  storeId,
  product,
  stockItems,
  onClose,
}: {
  storeId: string;
  product: Product;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();

  function confirmProduzir() {
    startTransition(async () => {
      const result = await produceBatchAction({
        storeId,
        productId: product.id,
        porcoes: qty,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível produzir.");
        return;
      }
      const short = result.shortages ?? [];
      if (short.length > 0) {
        toast.warning(
          `Produzido ${qty}× ${product.name} — estoque de ${short.length} insumo${short.length > 1 ? "s" : ""} ficou negativo.`,
          { description: `Agora ${result.producedStock} em estoque.` },
        );
      } else {
        toast.success(`Produzido ${qty}× ${product.name}.`, {
          description: `Agora ${result.producedStock} em estoque.`,
        });
      }
      onClose();
    });
  }

  const { byId, byName } = useMemo(() => {
    const byId = new Map<string, StockItem>();
    const byName = new Map<string, StockItem>();
    for (const s of stockItems) {
      byId.set(s.id, s);
      byName.set(s.name.toLowerCase(), s);
    }
    return { byId, byName };
  }, [stockItems]);

  const lines = useMemo<SimLine[]>(() => {
    return product.recipe.map((r, i) => {
      const item =
        (r.stockItemId ? byId.get(r.stockItemId) : undefined) ??
        byName.get(r.name.toLowerCase());
      const category = item?.category ?? null;

      // No linked stock, untracked, or "sem medição" rows never block production.
      if (!item) {
        return {
          key: `${i}`,
          name: r.name,
          category,
          needLabel: "—",
          ok: true,
        };
      }
      if (!item.tracked) {
        return {
          key: `${i}`,
          name: r.name,
          category,
          needLabel:
            r.qty == null ? "sem medição" : formatQty(r.qty * qty, r.unit),
          ok: true,
        };
      }

      // Contínuo: needs at least one usable package (no measured decrement).
      if (item.continuousUse) {
        const avail = usableAmount(item);
        const ok = avail >= 1;
        return {
          key: `${i}`,
          name: r.name,
          category,
          needLabel: `${qty} ${qty === 1 ? "uso" : "usos"}`,
          ok,
          shortLabel: ok ? undefined : "sem estoque",
        };
      }

      // Sem medição on a measured item → no decrement, no shortage.
      if (r.qty == null) {
        return {
          key: `${i}`,
          name: r.name,
          category,
          needLabel: "sem medição",
          ok: true,
        };
      }

      const need = r.qty * qty;
      const avail = isFrac(item) ? item.qty : usableAmount(item);
      const ok = avail >= need - 1e-4;
      const maxQty = r.qty > 0 ? Math.max(0, Math.floor((avail + 1e-4) / r.qty)) : undefined;
      return {
        key: `${i}`,
        name: r.name,
        category,
        needLabel: formatQty(need, r.unit),
        ok,
        shortLabel: ok ? undefined : `faltam ${formatQty(Math.max(0, need - avail), r.unit)}`,
        maxQty: ok ? undefined : maxQty,
      };
    });
  }, [product.recipe, byId, byName, qty]);

  const shortages = lines.filter((l) => !l.ok);
  const hasRecipe = lines.length > 0;

  // The most constraining shortage (fewest producible porções) drives the
  // actionable "reduza para N" suggestion in the warning banner below.
  const limitingShortage = shortages
    .filter((l): l is SimLine & { maxQty: number } => l.maxQty != null)
    .sort((a, b) => a.maxQty - b.maxQty)[0];
  const shortageMessage = limitingShortage
    ? `Produzindo assim, o estoque de ${limitingShortage.name} fica negativo. Reduza para ${limitingShortage.maxQty} ${limitingShortage.maxQty === 1 ? "porção" : "porções"} ou reponha o estoque.`
    : shortages.length > 0
      ? `Produzindo assim, o estoque de ${shortages[0].name} fica negativo.`
      : "";

  return (
    <>
      <SheetHeader className="gap-0 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-leaf">
          Produção em lote
        </span>
        <SheetTitle className="text-[19px] font-bold">{product.name}</SheetTitle>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-4">
        {/* Porção stepper */}
        <div>
          <span className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.4px] text-ink-faint">
            Quantidade a produzir
          </span>
          <div className="flex items-center gap-3.5">
            <StepBtn
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
            >
              <Minus className="size-[17px]" strokeWidth={2.2} />
            </StepBtn>
            <span className="tabular flex-1 text-center text-[30px] font-bold text-ink">
              {qty}
            </span>
            <StepBtn onClick={() => setQty((q) => q + 1)} highlight>
              <Plus className="size-[17px]" strokeWidth={2.2} />
            </StepBtn>
          </div>
        </div>

        <div>
          <span className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.4px] text-ink-faint">
            Consumo previsto
          </span>
          {hasRecipe ? (
            <div className="flex flex-col gap-2">
              {lines.map((l) => {
                const meta = l.category
                  ? STOCK_CATEGORY_META[l.category]
                  : null;
                return (
                  <div
                    key={l.key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
                      l.ok
                        ? "border-border bg-paper"
                        : "border-[#f2d8cf] bg-danger-wash",
                    )}
                  >
                    {l.ok ? (
                      meta ? (
                        <CategoryTile meta={meta} className="size-[30px]" />
                      ) : (
                        <span className="size-[30px] shrink-0 rounded-lg bg-wash" />
                      )
                    ) : (
                      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-danger-wash text-destructive">
                        <AlertTriangle className="size-[15px]" strokeWidth={1.9} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {l.name}
                    </span>
                    <span className="tabular shrink-0 text-[12.5px] font-bold text-ink">
                      {l.needLabel}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 whitespace-nowrap text-[11.5px] font-bold",
                        l.ok ? "text-success" : "text-destructive",
                      )}
                    >
                      {l.ok ? "ok" : l.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-paper px-3 py-4 text-center text-[12.5px] text-ink-faint">
              Este item não tem uma base de insumos cadastrada.
            </p>
          )}
        </div>

        {/* Live shortage warning — production is still allowed (best-effort,
            clamped consumption), so this is a heads-up, not a blocker. */}
        {hasRecipe &&
          (shortages.length > 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#f0e4c8] bg-amber-wash px-3.5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-wash text-amber">
                <AlertTriangle className="size-4" strokeWidth={2} />
              </span>
              <p className="flex-1 text-[12.5px] leading-relaxed text-ink-soft">
                {shortageMessage}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-[#cde7d6] bg-mint-wash px-4 py-3 text-[13px] font-semibold text-success">
              <CheckCircle2 className="size-4" />
              Estoque suficiente para {qty}× {product.name}
            </div>
          ))}

        {/* Finished-goods count this batch adds to. */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-mist text-primary">
            <Package className="size-4" strokeWidth={1.9} />
          </span>
          <span className="flex-1 text-[12.5px] text-ink-soft">
            Em estoque agora
          </span>
          <span className="tabular text-[15px] font-bold text-ink">
            {product.producedStock}
            <span className="ml-1.5 text-[12.5px] font-semibold text-success">
              +{qty}
            </span>
          </span>
        </div>
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
          onClick={confirmProduzir}
          disabled={pending}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending ? "Produzindo…" : "Registrar produção"}
        </Button>
      </SheetFooter>
    </>
  );
}

function StepBtn({
  onClick,
  disabled,
  highlight,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border transition-colors disabled:opacity-40",
        highlight ? "border-[#cddcc4] text-primary" : "border-border text-ink-soft",
        "hover:bg-mist",
      )}
    >
      {children}
    </button>
  );
}
