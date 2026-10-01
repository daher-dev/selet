"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createFinanceCategoryAction,
  createStockCategoryAction,
  createStockUnitAction,
  updateFinanceCategoryAction,
  updateStockCategoryAction,
  updateStockUnitAction,
  type SettingsResult,
} from "@/actions/settings";
import { CATEGORY_ICONS } from "@/components/category-meta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORY_ICON_KEYS,
  PALETTE,
  PALETTE_KEYS,
  type CategoryIconKey,
  type FinanceCategoryDef,
  type PaletteKey,
  type StockCategoryDef,
  type StockUnitDef,
  type UnitKind,
} from "@/lib/stock-settings";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- shared bits */

const LABEL = "mb-[9px] block text-[11px] font-bold uppercase tracking-[.6px] text-ink-faint";
const FIELD =
  "h-[46px] w-full rounded-xl border border-[#E7EEE6] bg-[#FAFCF8] px-[15px] text-[14px] text-ink outline-none transition-shadow placeholder:text-[#A0AC9D] focus:border-[#7FB093] focus:shadow-[0_0_0_3px_#DDEBD5]";

/** Modal frame shared by every settings dialog (design: Mock Configurações 2a–2d). */
function Frame({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-[20px] border-0 bg-white p-0 sm:max-w-[420px]"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="border-b border-[#F0F4ED] px-[22px] pb-4 pt-[22px]">
      <span className="block text-[11px] font-bold uppercase tracking-[.5px] text-leaf">{eyebrow}</span>
      <DialogTitle className="mt-[3px] text-[20px] font-bold text-ink">{title}</DialogTitle>
      <DialogDescription className="sr-only">{title}</DialogDescription>
    </div>
  );
}

function Footer({
  onCancel,
  confirm,
  pending,
  disabled,
  onConfirm,
  danger,
}: {
  onCancel: () => void;
  confirm: string;
  pending: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-2.5 border-t border-[#F0F4ED] px-[22px] py-4">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={pending}
        className="h-11 rounded-xl border-[#E7EEE6] bg-white px-[22px] text-[13.5px] font-semibold text-ink-soft"
      >
        Cancelar
      </Button>
      <Button
        type="button"
        onClick={onConfirm}
        disabled={pending || disabled}
        className={cn(
          "h-11 flex-1 rounded-xl text-[13.5px] font-semibold",
          danger && "bg-[#C0492F] text-white hover:bg-[#C0492F]/90",
        )}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {confirm}
      </Button>
    </div>
  );
}

function ColorSwatches({ value, onChange }: { value: PaletteKey; onChange: (c: PaletteKey) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {PALETTE_KEYS.map((key) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={PALETTE[key].label}
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              "size-[30px] rounded-full transition-shadow",
              on && "ring-2 ring-offset-2",
            )}
            style={{ backgroundColor: PALETTE[key].hex, ["--tw-ring-color" as string]: PALETTE[key].hex }}
          />
        );
      })}
    </div>
  );
}

/** Runs a settings action, toasting the error or closing + refreshing on success. */
function useSubmit(onDone: (result: SettingsResult) => void) {
  const [pending, startTransition] = useTransition();
  function submit(run: () => Promise<SettingsResult>, success: string) {
    startTransition(async () => {
      const r = await run();
      if (r.ok) {
        toast.success(success);
        onDone(r);
      } else toast.error(r.error ?? "Algo deu errado.");
    });
  }
  return { pending, submit };
}

interface DialogProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ----------------------------------------------------------------- stock category */

export function StockCategoryDialog({
  category,
  ...props
}: DialogProps & { category?: StockCategoryDef | null }) {
  return (
    <Frame open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <StockCategoryForm key={category?.id ?? "new"} category={category ?? null} {...props} />}
    </Frame>
  );
}

function StockCategoryForm({ storeId, onOpenChange, category }: DialogProps & { category: StockCategoryDef | null }) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState<CategoryIconKey>(category?.icon ?? "cup-soda");
  const [color, setColor] = useState<PaletteKey>(category?.color ?? "teal");
  const { pending, submit } = useSubmit(() => onOpenChange(false));
  const swatch = PALETTE[color];

  return (
    <>
      <Header
        eyebrow={category ? "Editar categoria" : "Nova categoria"}
        title={category ? "Editar categoria" : "Cadastrar categoria"}
      />
      <div className="space-y-5 px-[22px] py-5">
        <div>
          <label className={LABEL} htmlFor="stock-cat-name">Nome</label>
          <input
            id="stock-cat-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Laticínios"
            maxLength={40}
            className={FIELD}
          />
        </div>
        <div>
          <span className={LABEL}>Ícone</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ICON_KEYS.map((key) => {
              const Icon = CATEGORY_ICONS[key];
              const on = icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={on}
                  onClick={() => setIcon(key)}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl border bg-white",
                    on ? "" : "border-[#E7EEE6] text-ink-soft",
                  )}
                  style={on ? { borderColor: swatch.hex, backgroundColor: swatch.wash, color: swatch.hex } : undefined}
                >
                  <Icon className="size-[17px]" strokeWidth={1.8} />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className={LABEL}>Cor</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
      </div>
      <Footer
        onCancel={() => onOpenChange(false)}
        pending={pending}
        disabled={!name.trim()}
        confirm={category ? "Salvar categoria" : "Adicionar categoria"}
        onConfirm={() =>
          submit(
            () =>
              category
                ? updateStockCategoryAction(category.id, { storeId, name, icon, color })
                : createStockCategoryAction({ storeId, name, icon, color }),
            category ? "Categoria atualizada." : "Categoria adicionada.",
          )
        }
      />
    </>
  );
}

/* ----------------------------------------------------------------- stock unit */

export function StockUnitDialog({
  unit,
  usage,
  ...props
}: DialogProps & { unit?: StockUnitDef | null; usage?: number }) {
  return (
    <Frame open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <StockUnitForm key={unit?.id ?? "new"} unit={unit ?? null} usage={usage} {...props} />}
    </Frame>
  );
}

/** Copy follows the real consumption rule: count → exact deduction; measure → open pack tracked by usos. */
export const UNIT_KIND_HINT: Record<UnitKind, string> = {
  count: "Contagem: dá baixa por unidade a cada preparo.",
  measure: "Medida contínua: não é pesada a cada uso; a embalagem aberta é marcada como vazia.",
};

function StockUnitForm({
  storeId,
  onOpenChange,
  unit,
  usage = 0,
}: DialogProps & { unit: StockUnitDef | null; usage?: number }) {
  const [kind, setKind] = useState<UnitKind>(unit?.kind ?? "measure");
  const [symbol, setSymbol] = useState(unit?.symbol ?? "");
  const [name, setName] = useState(unit?.name ?? "");
  const [plural, setPlural] = useState(unit?.plural ?? "");
  const { pending, submit } = useSubmit(() => onOpenChange(false));
  const m = kind === "measure";
  // The kind decides each item's consumption mode, so it is fixed once created.
  const kindLocked = unit !== null;

  return (
    <>
      <Header eyebrow={unit ? "Editar unidade" : "Nova unidade"} title={unit ? "Editar unidade de uso" : "Cadastrar unidade de uso"} />
      <div className="space-y-5 px-[22px] py-5">
        <div>
          <span className={LABEL}>Tipo</span>
          <div role="group" aria-label="Tipo de unidade" className="flex gap-1 rounded-xl bg-[#F1F6EE] p-[3px]">
            {(
              [
                ["count", "Contagem"],
                ["measure", "Medida contínua"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                disabled={kindLocked && kind !== k}
                onClick={() => setKind(k)}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center rounded-[9px] text-[13px] font-semibold transition-colors disabled:opacity-40",
                  kind === k ? "bg-primary text-white" : "text-ink-soft",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[88px_1fr_1fr] gap-3">
          <div>
            <label className={LABEL} htmlFor="unit-symbol">Sigla</label>
            <input
              id="unit-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={m ? "Ex: g" : "Ex: pç"}
              maxLength={8}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="unit-name">Nome</label>
            <input
              id="unit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={m ? "Ex: grama" : "Ex: peça"}
              maxLength={30}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="unit-plural">Nome (plural)</label>
            <input
              id="unit-plural"
              value={plural}
              onChange={(e) => setPlural(e.target.value)}
              placeholder={m ? "Ex: gramas" : "Ex: peças"}
              maxLength={30}
              className={FIELD}
            />
          </div>
        </div>
        <p className="rounded-xl border border-[#E7EEE6] bg-[#F1F6EE] px-4 py-3.5 text-[12.5px] leading-[1.5] text-ink-soft">
          {UNIT_KIND_HINT[kind]}
        </p>
        {kindLocked && usage > 0 && (
          <p className="text-[12px] text-ink-faint">
            {usage} {usage === 1 ? "item usa" : "itens usam"} esta unidade — o tipo não pode mudar.
          </p>
        )}
      </div>
      <Footer
        onCancel={() => onOpenChange(false)}
        pending={pending}
        disabled={!symbol.trim() || !name.trim() || !plural.trim()}
        confirm={unit ? "Salvar unidade" : "Adicionar unidade"}
        onConfirm={() =>
          submit(
            () =>
              unit
                ? updateStockUnitAction(unit.id, { storeId, symbol, name, plural, kind })
                : createStockUnitAction({ storeId, symbol, name, plural, kind }),
            unit ? "Unidade atualizada." : "Unidade adicionada.",
          )
        }
      />
    </>
  );
}

/* ----------------------------------------------------------------- finance category */

export function FinanceCategoryDialog({
  category,
  defaultDirection = "out",
  lockDirection = false,
  onSaved,
  ...props
}: DialogProps & {
  category?: FinanceCategoryDef | null;
  defaultDirection?: "in" | "out";
  /** Fix the Tipo to `defaultDirection` (inline create from a lançamento). */
  lockDirection?: boolean;
  onSaved?: (id: string | undefined) => void;
}) {
  return (
    <Frame open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && (
        <FinanceCategoryForm
          key={category?.id ?? `new-${defaultDirection}`}
          category={category ?? null}
          defaultDirection={defaultDirection}
          lockDirection={lockDirection}
          onSaved={onSaved}
          {...props}
        />
      )}
    </Frame>
  );
}

function FinanceCategoryForm({
  storeId,
  onOpenChange,
  category,
  defaultDirection,
  lockDirection,
  onSaved,
}: DialogProps & {
  category: FinanceCategoryDef | null;
  defaultDirection: "in" | "out";
  lockDirection: boolean;
  onSaved?: (id: string | undefined) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [direction, setDirection] = useState<"in" | "out">(category?.direction ?? defaultDirection);
  const [color, setColor] = useState<PaletteKey>(category?.color ?? "ocre");
  const { pending, submit } = useSubmit((r) => {
    onOpenChange(false);
    onSaved?.(r.id);
  });
  const dirLocked = category !== null || lockDirection;

  return (
    <>
      <Header
        eyebrow={category ? "Editar categoria" : "Nova categoria"}
        title={category ? "Editar categoria" : "Cadastrar categoria"}
      />
      <div className="space-y-5 px-[22px] py-5">
        <div>
          <span className={LABEL}>Tipo</span>
          <div role="group" aria-label="Tipo de lançamento" className="flex gap-1 rounded-xl bg-[#F1F6EE] p-[3px]">
            {(
              [
                ["out", "Saída"],
                ["in", "Entrada"],
              ] as const
            ).map(([d, label]) => (
              <button
                key={d}
                type="button"
                aria-pressed={direction === d}
                disabled={dirLocked && direction !== d}
                onClick={() => setDirection(d)}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center rounded-[9px] text-[13px] font-semibold transition-colors disabled:opacity-40",
                  direction === d ? "bg-primary text-white" : "text-ink-soft",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="fin-cat-name">Nome</label>
          <input
            id="fin-cat-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={direction === "out" ? "Ex: Manutenção" : "Ex: Reembolsos"}
            maxLength={40}
            className={FIELD}
          />
        </div>
        <div>
          <span className={LABEL}>Cor</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
      </div>
      <Footer
        onCancel={() => onOpenChange(false)}
        pending={pending}
        disabled={!name.trim()}
        confirm={category ? "Salvar categoria" : "Adicionar categoria"}
        onConfirm={() =>
          submit(
            () =>
              category
                ? updateFinanceCategoryAction(category.id, { storeId, name, direction, color })
                : createFinanceCategoryAction({ storeId, name, direction, color }),
            category ? "Categoria atualizada." : "Categoria adicionada.",
          )
        }
      />
    </>
  );
}

/* ----------------------------------------------------------------- delete confirmations */

interface MoveOption {
  id: string;
  name: string;
}

/**
 * Delete confirmation (design 2c/2d). With `count > 0` and `moveOptions`, asks
 * where to move the linked records first; with `blockedReason`, explains why the
 * delete can't happen and offers no confirm.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  moveLabel,
  moveOptions,
  blockedReason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Caption above the move-target select (e.g. "Mover itens para"). */
  moveLabel?: string;
  moveOptions?: MoveOption[];
  blockedReason?: string;
  /** Receives the chosen move target (undefined when none is needed). */
  onConfirm: (moveToId: string | undefined) => Promise<SettingsResult>;
}) {
  return (
    <Frame open={open} onOpenChange={onOpenChange}>
      {open && (
        <DeleteBody
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          moveLabel={moveLabel}
          moveOptions={moveOptions}
          blockedReason={blockedReason}
          onConfirm={onConfirm}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Frame>
  );
}

function DeleteBody({
  title,
  description,
  confirmLabel,
  moveLabel,
  moveOptions,
  blockedReason,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  moveLabel?: string;
  moveOptions?: MoveOption[];
  blockedReason?: string;
  onConfirm: (moveToId: string | undefined) => Promise<SettingsResult>;
  onClose: () => void;
}) {
  const [moveTo, setMoveTo] = useState<string | undefined>(moveOptions?.[0]?.id);
  const { pending, submit } = useSubmit(onClose);
  const needsMove = !!moveOptions;

  return (
    <>
      <div className="px-[22px] pb-[18px] pt-[22px]">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[#FBE9E4] text-[#C0492F]">
          <Trash2 className="size-5" strokeWidth={1.9} />
        </span>
        <DialogTitle className="mt-4 text-[20px] font-bold text-ink">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-[14px] leading-[1.5] text-ink-soft">
          {blockedReason ?? description}
        </DialogDescription>
        {needsMove && !blockedReason && (
          <div className="mt-[18px]">
            <span className={LABEL}>{moveLabel}</span>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger className="h-[46px] w-full rounded-xl border-[#E7EEE6] bg-[#FAFCF8] px-[15px] text-[14px] data-[size=default]:h-[46px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {moveOptions!.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {blockedReason ? (
        <div className="border-t border-[#F0F4ED] px-[22px] py-4">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 w-full rounded-xl">
            Entendi
          </Button>
        </div>
      ) : (
        <Footer
          danger
          onCancel={onClose}
          pending={pending}
          disabled={needsMove && !moveTo}
          confirm={confirmLabel}
          onConfirm={() => submit(() => onConfirm(needsMove ? moveTo : undefined), "Excluído.")}
        />
      )}
    </>
  );
}
