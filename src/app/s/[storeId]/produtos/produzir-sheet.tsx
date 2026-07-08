"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Minus, Plus } from "lucide-react";
import type { Product, StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";
import { isFrac, unitLabel, usableAmount } from "../estoque/stock-view";

/**
 * READ-ONLY "Produzir" simulation. Given a menu recipe and a porção count, it
 * previews the per-insumo stock consumption (need vs available, red/green) and
 * detects shortages — mirroring the design's live "Consumo do estoque" panel.
 *
 * TODO(Phase 2): the confirm button is intentionally disabled. The real
 * produce-to-stock write (deplete open→sealed packages, bump contínuo `usos`,
 * log CONSUMO movements, "abriu N caixa") is the cross-page consumption engine
 * and must NOT be wired here — this component only builds the UI + simulation so
 * Phase 2 only needs to attach the server write to `confirmProduzir`.
 */
export function ProduzirSheet({
  product,
  stockItems,
  open,
  onOpenChange,
}: {
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
  availLabel: string;
  needLabel: string;
  ok: boolean;
}

function ProduzirBody({
  product,
  stockItems,
  onClose,
}: {
  product: Product;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);

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
          availLabel: "sem vínculo",
          needLabel: "—",
          ok: true,
        };
      }
      if (!item.tracked) {
        return {
          key: `${i}`,
          name: r.name,
          category,
          availLabel: "não rastreado",
          needLabel:
            r.qty == null ? "sem medição" : formatQty(r.qty * qty, r.unit),
          ok: true,
        };
      }

      // Contínuo: needs at least one usable package (no measured decrement).
      if (item.continuousUse) {
        const avail = usableAmount(item);
        const pkg = item.pkgLabel ?? "emb.";
        return {
          key: `${i}`,
          name: r.name,
          category,
          availLabel: `${avail} ${avail === 1 ? pkg : pkg + "s"}`,
          needLabel: `${qty} ${qty === 1 ? "uso" : "usos"}`,
          ok: avail >= 1,
        };
      }

      // Sem medição on a measured item → no decrement, no shortage.
      if (r.qty == null) {
        return {
          key: `${i}`,
          name: r.name,
          category,
          availLabel: `${formatQty(item.qty, unitLabel(item.unit))} disponível`,
          needLabel: "sem medição",
          ok: true,
        };
      }

      const need = r.qty * qty;
      const avail = isFrac(item) ? item.qty : usableAmount(item);
      return {
        key: `${i}`,
        name: r.name,
        category,
        availLabel: `${formatQty(avail, unitLabel(item.unit))} disponível`,
        needLabel: formatQty(need, r.unit),
        ok: avail >= need - 1e-4,
      };
    });
  }, [product.recipe, byId, byName, qty]);

  const shortages = lines.filter((l) => !l.ok);
  const hasRecipe = lines.length > 0;

  return (
    <>
      <SheetHeader className="gap-0 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-leaf">
          Produzir para o estoque
        </span>
        <SheetTitle className="text-[19px] font-bold">{product.name}</SheetTitle>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-4">
        {/* Porção stepper */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="flex-1 text-[13px] font-semibold text-ink-soft">
            Quantas porções?
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            <StepBtn
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
            >
              <Minus className="size-[15px]" strokeWidth={2.4} />
            </StepBtn>
            <span className="tabular min-w-8 text-center text-[16px] font-extrabold text-ink">
              {qty}
            </span>
            <StepBtn onClick={() => setQty((q) => q + 1)} highlight>
              <Plus className="size-[15px]" strokeWidth={2.4} />
            </StepBtn>
          </div>
        </div>

        <div>
          <span className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.4px] text-ink-faint">
            Consumo do estoque
          </span>
          {hasRecipe ? (
            <div className="flex flex-col gap-2.5">
              {lines.map((l) => {
                const meta = l.category
                  ? STOCK_CATEGORY_META[l.category]
                  : null;
                return (
                  <div
                    key={l.key}
                    className="flex items-center gap-3 rounded-xl border border-border bg-paper px-3 py-2.5"
                  >
                    {meta ? (
                      <CategoryTile meta={meta} className="size-[30px]" />
                    ) : (
                      <span className="size-[30px] shrink-0 rounded-lg bg-wash" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {l.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-faint">
                        disponível: {l.availLabel}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "tabular shrink-0 whitespace-nowrap text-[13.5px] font-bold",
                        l.ok ? "text-success" : "text-destructive",
                      )}
                    >
                      {l.needLabel === "—" || l.needLabel === "sem medição"
                        ? l.needLabel
                        : `−${l.needLabel}`}
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

        {/* Live shortage / ok preview */}
        {hasRecipe &&
          (shortages.length > 0 ? (
            <div className="rounded-xl border border-[#f1c9be] bg-danger-wash px-4 py-3">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-destructive">
                <AlertTriangle className="size-4" />
                Estoque insuficiente
              </div>
              <div className="mt-2 flex flex-col gap-1">
                {shortages.map((l) => (
                  <div
                    key={l.key}
                    className="flex items-center gap-2 text-[12.5px] text-ink-soft"
                  >
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="font-semibold text-destructive">
                      em falta
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-[#cde7d6] bg-mint-wash px-4 py-3 text-[13px] font-semibold text-success">
              <CheckCircle2 className="size-4" />
              Estoque suficiente para {qty}× {product.name}
            </div>
          ))}

        <p className="text-center text-[11.5px] leading-relaxed text-ink-faint">
          A baixa automática do estoque ao produzir chega em breve.
        </p>
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1 rounded-xl"
        >
          Fechar
        </Button>
        {/* TODO(Phase 2): enable + wire confirmProduzir to the stock-consumption engine. */}
        <Button disabled className="flex-1 rounded-xl font-semibold">
          Confirmar (em breve)
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
        "flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        highlight ? "text-primary" : "text-ink-soft",
        "hover:bg-mist",
      )}
    >
      {children}
    </button>
  );
}
