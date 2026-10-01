"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { useStockCategoryMeta, useStockSettings, useUnits } from "@/components/stock-settings-context";
import { pkgPlural } from "./stock-view";
import { UnitPicker } from "./unit-picker";

interface Props {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockItemFormSheet({ storeId, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="gap-0 border-b border-[#EEF3EA] px-6 pb-4 pt-[22px]">
          <span className="text-[11px] font-bold uppercase tracking-[.6px] text-leaf">
            Novo item de estoque
          </span>
          <SheetTitle className="mt-1 text-[22px] font-bold">
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
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const { categories } = useStockSettings();
  const { units, unitKind, unitLabel } = useUnits();
  const [category, setCategory] = useState<string>(
    () => categories.find((c) => c.id === "bebidas")?.id ?? categories[0]?.id ?? "",
  );
  const [unit, setUnit] = useState<string>(() => units.find((u) => u.id === "un")?.id ?? units[0]?.id ?? "");
  const [pkgLabel, setPkgLabel] = useState("caixa");
  const [pkgLabelPluralInput, setPkgLabelPluralInput] = useState("");
  const [pkgSize, setPkgSize] = useState("12");
  const [sealed, setSealed] = useState("");
  const [cost, setCost] = useState("");
  const [reorder, setReorder] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isCount = unitKind(unit) === "count";
  const pkgLabelValue = pkgLabel.trim() || "caixa";
  const pkgLabelPlural = pkgPlural(pkgLabelValue, pkgLabelPluralInput);
  // UNIT RULE: the consumption mode is DERIVED from the unit, never chosen —
  // weight/volume → contínuo (manual, mark-as-empty); countable → medido (auto).
  const isWeightVol = unitKind(unit) === "measure";

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
        pkgLabel: pkgLabelValue,
        pkgLabelPlural: pkgLabelPluralInput.trim() || undefined,
        pkgSize: size,
        continuousUse: isWeightVol,
        consumptionMode: isWeightVol ? "continuo" : "medido",
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
      <div className="flex-1 space-y-[22px] px-6 py-[22px]">
        <div>
          <FieldLabel>Nome do item</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Leite de coco"
            className="h-[50px] rounded-[13px] border-[#E7EEE6] bg-[#FAFCF8] px-[15px] text-[15px] focus-visible:border-[#7FB093] focus-visible:ring-[3px] focus-visible:ring-[#DDEBD5]"
          />
        </div>

        <div>
          <FieldLabel>Categoria</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {categories.map(({ id: key }) => {
              const meta = STOCK_CATEGORY_META[key];
              const Icon = meta.icon;
              const on = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "flex h-9 items-center gap-[7px] rounded-[11px] border px-[13px] text-[13px] font-semibold transition-colors",
                    on
                      ? "border-primary bg-primary text-white"
                      : "border-[#E7EEE6] bg-[#FAFCF8] text-ink-soft hover:border-primary/40",
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
          <FieldLabel>Embalagem</FieldLabel>
          <InlineInput
            value={pkgLabel}
            onChange={setPkgLabel}
            placeholder="Ex: caixa, pote, saco"
            inputMode="text"
          />
          <FieldLabel>Embalagem (plural)</FieldLabel>
          <InlineInput
            value={pkgLabelPluralInput}
            onChange={setPkgLabelPluralInput}
            placeholder={pkgPlural(pkgLabelValue)}
            inputMode="text"
          />
        </div>

        <div>
          <FieldLabel>Unidade de uso</FieldLabel>
          <UnitPicker value={unit} onChange={setUnit} />
        </div>

        {isCount && (
          <div>
            <FieldLabel>
              Lote <span className="font-semibold normal-case tracking-normal text-ink-faint">(opcional)</span>
            </FieldLabel>
            <InlineInput
              value={pkgSize}
              onChange={setPkgSize}
              suffix={`${unitLabel(unit)} / ${pkgLabelValue}`}
              inputMode="decimal"
            />
          </div>
        )}

        <div>
          <FieldLabel>Baixa no estoque</FieldLabel>
          <BaixaInfo isWeightVol={isWeightVol} />
        </div>

        <div>
          <span className="mb-[9px] flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[.6px] text-ink-faint">
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
          <div className="grid grid-cols-2 gap-3">
            <SmallField label="Quantidade" className="flex-1">
              <InlineInput
                value={sealed}
                onChange={setSealed}
                suffix={pkgLabelPlural}
                inputMode="numeric"
              />
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
            suffix={pkgLabelPlural}
            placeholder="auto"
            inputMode="decimal"
          />
        </div>
      </div>

      <SheetFooter className="flex-row gap-2.5 border-t border-[#F0F4ED] px-6 py-4">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="h-12 flex-1 rounded-xl border-[#E7EEE6] bg-[#F1F6EE] text-[14px] font-semibold text-ink hover:bg-[#E9F1E5]"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="h-12 flex-[1.3] rounded-xl text-[14px] font-semibold disabled:bg-[#8DB9A0] disabled:opacity-100"
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
    <div className="rounded-xl border border-[#E7EEE6] bg-[#F1F6EE] px-[17px] py-[15px]">
      <span className="block text-[14px] font-bold text-ink">
        {isWeightVol
          ? "Controle manual · marcar como vazia"
          : "Baixa automática por contagem"}
      </span>
      <p className="mt-[3px] text-[12.5px] leading-[1.45] text-ink-faint">
        {isWeightVol
          ? "Itens por peso/volume não são pesados a cada uso — baixa manual por embalagem."
          : "Itens contáveis (un/sachê) deduzem a quantidade usada a cada preparo."}
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-[9px] block text-[11px] font-bold uppercase tracking-[.6px] text-ink-faint">
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
      <span className="mb-1.5 block text-[12.5px] text-ink-faint">{label}</span>
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
    <div className="flex h-[46px] items-center gap-1.5 rounded-xl border border-[#E7EEE6] bg-[#FAFCF8] px-[15px]">
      {prefix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className="tabular w-full min-w-0 bg-transparent text-[14px] font-bold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      {suffix && <span className="whitespace-nowrap text-[13px] text-ink-faint">{suffix}</span>}
    </div>
  );
}
