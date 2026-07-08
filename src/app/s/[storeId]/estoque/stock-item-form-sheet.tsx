"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StockCategory, StockUnit } from "@/lib/types";
import {
  consumptionModeForUnit,
  isWeightVolumeUnit,
  STOCK_CATEGORIES,
} from "@/lib/types";
import { parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createStockItemAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STOCK_CATEGORY_META } from "@/components/category-meta";
import { unitLabel } from "./stock-view";

interface Props {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UNIT_GROUPS: StockUnit[][] = [
  ["un", "sache"],
  ["g", "kg"],
  ["ml", "L"],
];

export function StockItemFormSheet({ storeId, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]"
      >
        <SheetHeader className="gap-0 border-b border-border p-5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-leaf">
            Novo item de estoque
          </span>
          <SheetTitle className="mt-0.5 text-[19px] font-bold">
            Cadastrar item
          </SheetTitle>
        </SheetHeader>
        <StockItemForm
          key={open ? "open" : "closed"}
          storeId={storeId}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function StockItemForm({
  storeId,
  onClose,
}: {
  storeId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>("bebidas");
  const [unit, setUnit] = useState<StockUnit>("un");
  const [pkgSize, setPkgSize] = useState("12");
  const [sealed, setSealed] = useState("");
  const [cost, setCost] = useState("");
  const [reorder, setReorder] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isCount = unit === "un" || unit === "sache";
  // UNIT RULE: the consumption mode is DERIVED from the unit, never chosen —
  // weight/volume → contínuo (manual, mark-as-empty); countable → medido (auto).
  const isWeightVol = isWeightVolumeUnit(unit);

  function submit() {
    if (!name.trim()) return toast.error("Informe o nome do item.");
    const size = Number(String(pkgSize).replace(",", ".")) || 1;
    const sealedN = Math.round(Number(sealed) || 0);
    let costC: number | undefined;
    if (cost.trim()) {
      try {
        costC = parseBRL(cost);
      } catch {
        return toast.error("Preço inválido.");
      }
    }
    const reorderN =
      reorder.trim() !== ""
        ? Math.max(0, Number(String(reorder).replace(",", ".")) || 0)
        : Math.max(1, Math.round(sealedN / 3));

    startTransition(async () => {
      const r = await createStockItemAction({
        storeId,
        name: name.trim(),
        category,
        unit,
        tracked: true,
        pkgLabel: "caixa",
        pkgSize: size,
        continuousUse: isWeightVol,
        consumptionMode: consumptionModeForUnit(unit),
        resellable: false,
        cost: costC,
        reorderAt: reorderN,
        archived: false,
        initialSealed: sealedN,
        initialOpen: 0,
      });
      if (r.ok) {
        toast.success("Item adicionado ao estoque.");
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <div className="flex-1 space-y-5 p-5">
        <div>
          <FieldLabel>Nome do item</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Leite de coco"
            className="h-[42px] rounded-lg bg-paper"
          />
        </div>

        <div>
          <FieldLabel>Categoria</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {STOCK_CATEGORIES.map((key) => {
              const meta = STOCK_CATEGORY_META[key];
              const Icon = meta.icon;
              const on = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    on
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-ink-soft hover:border-primary/40",
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={1.8} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel>Unidade de uso</FieldLabel>
          <div className="flex gap-2">
            {UNIT_GROUPS.map((group, gi) => (
              <div
                key={gi}
                className="flex flex-1 gap-0.5 rounded-lg border border-border bg-surface p-0.5"
              >
                {group.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      "flex-1 rounded-md py-2 text-[12.5px] font-semibold transition-colors",
                      unit === u ? "bg-primary text-white" : "text-ink-soft hover:text-ink",
                    )}
                  >
                    {unitLabel(u)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {isCount && (
          <div>
            <FieldLabel>
              Lote <span className="font-semibold normal-case tracking-normal text-ink-faint">(opcional)</span>
            </FieldLabel>
            <InlineInput
              value={pkgSize}
              onChange={setPkgSize}
              suffix={`${unitLabel(unit)} / caixa`}
              inputMode="decimal"
            />
          </div>
        )}

        <div>
          <FieldLabel>Baixa no estoque</FieldLabel>
          <BaixaInfo isWeightVol={isWeightVol} />
        </div>

        <div>
          <span className="mb-2 flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Estoque inicial
            </span>
            <span className="text-[11px] font-semibold text-ink-faint">(opcional)</span>
            <span className="relative inline-flex">
              {tipOpen && (
                <span className="fixed inset-0 z-10" onClick={() => setTipOpen(false)} />
              )}
              <button
                type="button"
                onClick={() => setTipOpen((v) => !v)}
                className="relative z-20 flex size-4 items-center justify-center rounded-full border border-[#c5cfc7] text-[10px] font-bold text-ink-faint"
              >
                i
              </button>
              {tipOpen && (
                <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-52 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-[11.5px] font-medium leading-snug text-white shadow-lg">
                  Se informados, geram uma entrada no histórico.
                </span>
              )}
            </span>
          </span>
          <div className="flex gap-2.5">
            <SmallField label="Quantidade" className="flex-1">
              <InlineInput value={sealed} onChange={setSealed} suffix="caixas" inputMode="numeric" />
            </SmallField>
            <SmallField label="Preço de compra" className="flex-1">
              <InlineInput value={cost} onChange={setCost} prefix="R$" inputMode="decimal" />
            </SmallField>
          </div>
        </div>

        <div>
          <FieldLabel>
            Alerta de estoque baixo{" "}
            <span className="font-semibold normal-case tracking-normal text-ink-faint">(opcional)</span>
          </FieldLabel>
          <InlineInput
            value={reorder}
            onChange={setReorder}
            prefix="avisar abaixo de"
            suffix="caixas"
            placeholder="auto"
            inputMode="decimal"
          />
        </div>
      </div>

      <SheetFooter className="flex-row gap-2.5 border-t border-border p-5">
        <Button variant="outline" onClick={onClose} disabled={pending} className="flex-1 rounded-lg">
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="flex-[1.4] rounded-lg font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Adicionar ao estoque
        </Button>
      </SheetFooter>
    </>
  );
}

/**
 * Read-only display of the DERIVED consumption mode (UNIT RULE): the mode is
 * fixed by the unit, so there is nothing to toggle — weight/volume items are
 * manual (mark-as-empty), countable items deduct automatically by count.
 */
function BaixaInfo({ isWeightVol }: { isWeightVol: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <span className="block text-[12.5px] font-semibold text-ink">
        {isWeightVol
          ? "Controle manual · marcar como vazia"
          : "Baixa automática por contagem"}
      </span>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
        {isWeightVol
          ? "Itens por peso/volume não são pesados a cada uso — baixa manual por embalagem."
          : "Itens contáveis (un/sachê) deduzem a quantidade usada a cada preparo."}
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
      {children}
    </span>
  );
}

function SmallField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function InlineInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <div className="flex h-[42px] items-center gap-1.5 rounded-lg border border-border bg-paper px-3.5">
      {prefix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className="tabular w-full min-w-0 bg-transparent text-[15px] font-bold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      {suffix && <span className="whitespace-nowrap text-[13px] text-ink-faint">{suffix}</span>}
    </div>
  );
}
