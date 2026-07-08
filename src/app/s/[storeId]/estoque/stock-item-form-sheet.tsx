"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { StockCategory, StockItem, StockUnit } from "@/lib/types";
import { STOCK_CATEGORIES, STOCK_UNITS } from "@/lib/types";
import { formatBRL, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createStockItemAction,
  deleteStockItemAction,
  updateStockItemAction,
} from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STOCK_CATEGORY_META } from "@/components/category-meta";

interface StockItemFormSheetProps {
  storeId: string;
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockItemFormSheet({
  storeId,
  item,
  open,
  onOpenChange,
}: StockItemFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-[17px] font-bold">
            {item ? "Editar item" : "Novo item"}
          </SheetTitle>
        </SheetHeader>
        <StockItemForm
          key={item?.id ?? "new"}
          storeId={storeId}
          item={item}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function StockItemForm({
  storeId,
  item,
  onClose,
}: {
  storeId: string;
  item: StockItem | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<StockCategory>(item?.category ?? "secos");
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? "g");
  const [tracked, setTracked] = useState(item?.tracked ?? false);
  const [pkgLabel, setPkgLabel] = useState(item?.pkgLabel ?? "");
  const [pkgSize, setPkgSize] = useState(item?.pkgSize ? String(item.pkgSize) : "");
  const [continuousUse, setContinuousUse] = useState(item?.continuousUse ?? false);
  const [resellable, setResellable] = useState(item?.resellable ?? false);
  const [cost, setCost] = useState(
    item?.cost != null ? formatBRL(item.cost).replace(/R\$\s?/, "") : "",
  );
  const [sellPrice, setSellPrice] = useState(
    item?.sellPrice != null ? formatBRL(item.sellPrice).replace(/R\$\s?/, "") : "",
  );
  const [reorderAt, setReorderAt] = useState(item ? String(item.reorderAt) : "");
  const [yieldPct, setYieldPct] = useState(
    item?.yieldPct != null ? String(item.yieldPct) : "",
  );
  const [archived, setArchived] = useState(item?.archived ?? false);
  const [initialSealed, setInitialSealed] = useState("0");
  const [initialOpen, setInitialOpen] = useState("0");
  const [pending, startTransition] = useTransition();

  function money(value: string): number | undefined {
    if (!value.trim()) return undefined;
    try {
      return parseBRL(value);
    } catch {
      return undefined;
    }
  }

  function submit() {
    startTransition(async () => {
      const input = {
        storeId,
        name,
        category,
        unit,
        tracked,
        pkgLabel: tracked ? pkgLabel || undefined : undefined,
        pkgSize: tracked && pkgSize ? Number(pkgSize) : undefined,
        continuousUse,
        resellable,
        cost: money(cost),
        sellPrice: resellable ? money(sellPrice) : undefined,
        reorderAt: reorderAt ? Number(reorderAt) : 0,
        yieldPct: yieldPct ? Number(yieldPct) : undefined,
        archived,
        initialSealed: Number(initialSealed) || 0,
        initialOpen: Number(initialOpen) || 0,
      };
      const result = item
        ? await updateStockItemAction(item.id, input)
        : await createStockItemAction(input);
      if (result.ok) {
        toast.success(item ? "Item atualizado." : "Item criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    if (!item) return;
    startTransition(async () => {
      const result = await deleteStockItemAction(storeId, item.id);
      if (result.ok) {
        toast.success("Item removido.");
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
          <Label htmlFor="stock-name">Nome</Label>
          <Input
            id="stock-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Granola artesanal"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <div className="flex flex-wrap gap-2">
            {STOCK_CATEGORIES.map((key) => {
              const meta = STOCK_CATEGORY_META[key];
              const selected = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    selected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-ink-soft hover:border-primary/40",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Unidade</Label>
          <div className="flex gap-2">
            {STOCK_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-[12.5px] font-semibold transition-colors",
                  unit === u
                    ? "border-primary bg-mist text-primary"
                    : "border-border bg-card text-ink-soft hover:border-primary/40",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          title="Rastreado por embalagem"
          description="Controle embalagens lacradas e quantidade aberta."
          checked={tracked}
          onChange={setTracked}
        />

        {tracked && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-paper p-3">
            <div className="space-y-1.5">
              <Label htmlFor="stock-pkg-label">Embalagem</Label>
              <Input
                id="stock-pkg-label"
                value={pkgLabel}
                onChange={(e) => setPkgLabel(e.target.value)}
                placeholder="pote, caixa…"
                className="rounded-xl bg-card"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock-pkg-size">Tamanho ({unit})</Label>
              <Input
                id="stock-pkg-size"
                value={pkgSize}
                onChange={(e) => setPkgSize(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="500"
                inputMode="decimal"
                className="rounded-xl bg-card tabular"
              />
            </div>
          </div>
        )}

        <ToggleRow
          title="Uso contínuo"
          description="Consumo sem medição exata — controle só por abertura de embalagem."
          checked={continuousUse}
          onChange={setContinuousUse}
        />

        <ToggleRow
          title="Revendável"
          description="Item também é vendido no varejo."
          checked={resellable}
          onChange={setResellable}
        />

        <ToggleRow
          title="Arquivado"
          description="Itens arquivados não aparecem na lista padrão do estoque."
          checked={archived}
          onChange={setArchived}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stock-cost">
              Custo {tracked ? "por embalagem" : `por ${unit}`}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                R$
              </span>
              <Input
                id="stock-cost"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="18,00"
                inputMode="decimal"
                className="rounded-xl pl-9 tabular"
              />
            </div>
          </div>
          {resellable && (
            <div className="space-y-1.5">
              <Label htmlFor="stock-sell">Preço de venda</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                  R$
                </span>
                <Input
                  id="stock-sell"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder="32,00"
                  inputMode="decimal"
                  className="rounded-xl pl-9 tabular"
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stock-reorder">Repor abaixo de ({unit})</Label>
            <Input
              id="stock-reorder"
              value={reorderAt}
              onChange={(e) => setReorderAt(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="1000"
              inputMode="decimal"
              className="rounded-xl tabular"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock-yield">Rendimento (%)</Label>
            <Input
              id="stock-yield"
              value={yieldPct}
              onChange={(e) => setYieldPct(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="90"
              inputMode="numeric"
              className="rounded-xl tabular"
            />
          </div>
        </div>

        {!item && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-paper p-3">
            {tracked && (
              <div className="space-y-1.5">
                <Label htmlFor="stock-initial-sealed">Lacradas iniciais</Label>
                <Input
                  id="stock-initial-sealed"
                  value={initialSealed}
                  onChange={(e) => setInitialSealed(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  className="rounded-xl bg-card tabular"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="stock-initial-open">
                {tracked ? `Aberto inicial (${unit})` : `Quantidade inicial (${unit})`}
              </Label>
              <Input
                id="stock-initial-open"
                value={initialOpen}
                onChange={(e) => setInitialOpen(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                className="rounded-xl bg-card tabular"
              />
            </div>
          </div>
        )}

        {item && (
          <Button
            variant="ghost"
            onClick={remove}
            disabled={pending}
            className="w-full gap-1.5 rounded-xl text-destructive hover:bg-danger-wash hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Remover item
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
          disabled={pending || !name.trim() || (tracked && (!pkgLabel.trim() || !pkgSize))}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </SheetFooter>
    </>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-paper px-3.5 py-3">
      <div>
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="text-[11.5px] text-ink-faint">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
