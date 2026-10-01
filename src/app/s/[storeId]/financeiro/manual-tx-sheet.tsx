"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Loader2,
  Lock,
  Package,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { FinanceTx } from "@/lib/types";
import { FINANCE_CATEGORIES } from "@/lib/types";
import { formatBRL, formatDate, orderCode, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createManualTxAction,
  deleteManualTxAction,
  updateManualTxAction,
} from "@/actions/finance";
import { CATEGORY_LABELS, dayMonth, todayDateInput } from "./finance-shared";
import { TxAmount, TxIcon } from "./tx-visuals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ManualTxSheetProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Row being opened for edit/view. Omit (or null) to create a new one. */
  editingTx?: FinanceTx | null;
  /** stockItemId → name, to label a vinculado-ao-estoque row's Origem chip. */
  stockItemNames?: Record<string, string>;
}

export function ManualTxSheet({
  storeId,
  open,
  onOpenChange,
  editingTx = null,
  stockItemNames = {},
}: ManualTxSheetProps) {
  const isLinked = editingTx != null && editingTx.source !== "manual";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
        // Land focus on the first field (form) or nowhere (read-only view) —
        // the default would focus the Entrada/Saída toggle, whose focus ring
        // reads like a second selected option.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (!isLinked) document.getElementById("tx-label")?.focus();
        }}
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-[17px] font-bold">
            {editingTx == null
              ? "Novo lançamento"
              : isLinked
                ? "Lançamento vinculado"
                : "Editar lançamento"}
          </SheetTitle>
          {editingTx && (
            <SheetDescription className="text-[12px] text-ink-faint">
              {isLinked
                ? "Gerado automaticamente · somente leitura"
                : `Avulso · criado em ${dayMonth(editingTx.date)}${
                    editingTx.createdBy ? ` por ${editingTx.createdBy}` : ""
                  }`}
            </SheetDescription>
          )}
        </SheetHeader>
        {open && isLinked && editingTx && (
          <LinkedTxView storeId={storeId} tx={editingTx} stockItemNames={stockItemNames} />
        )}
        {open && !isLinked && (
          <ManualTxForm
            storeId={storeId}
            editingTx={editingTx}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Design field label: small uppercase caption above a 44px input. */
const FIELD_LABEL = "text-[11px] font-bold tracking-[.4px] text-ink-faint uppercase";
const FIELD_INPUT = "h-11 rounded-[11px] border-[#DDE7D8] px-3.5 text-[14px] font-medium";

function ManualTxForm({
  storeId,
  editingTx,
  onClose,
}: {
  storeId: string;
  editingTx: FinanceTx | null;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(editingTx?.label ?? "");
  const [direction, setDirection] = useState<"in" | "out">(editingTx?.direction ?? "out");
  const [category, setCategory] = useState<string>(editingTx?.category ?? "compras");
  const [amount, setAmount] = useState(
    editingTx ? formatBRL(editingTx.amount).replace("R$", "").trim() : "",
  );
  const [date, setDate] = useState(() =>
    editingTx ? editingTx.date.slice(0, 10) : todayDateInput(),
  );
  const [note, setNote] = useState(editingTx?.note ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    let amountCentavos: number;
    try {
      amountCentavos = parseBRL(amount);
    } catch {
      toast.error("Valor inválido.");
      return;
    }
    startTransition(async () => {
      const data = {
        storeId,
        label,
        category: category as (typeof FINANCE_CATEGORIES)[number],
        amount: amountCentavos,
        direction,
        date: new Date(`${date}T12:00:00Z`).toISOString(),
        note: note.trim() || undefined,
      };
      const result = editingTx
        ? await updateManualTxAction(editingTx.id, data)
        : await createManualTxAction(data);
      if (result.ok) {
        toast.success(editingTx ? "Lançamento atualizado." : "Lançamento registrado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete() {
    if (!editingTx) return;
    startTransition(async () => {
      const result = await deleteManualTxAction(storeId, editingTx.id);
      if (result.ok) {
        toast.success("Lançamento excluído.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-4 p-[22px]">
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
          className="flex gap-2 rounded-[11px] bg-[#F3F7F1] p-1"
        >
          {(
            [
              { value: "in", label: "Entrada", active: "text-success" },
              { value: "out", label: "Saída", active: "text-amber" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={direction === opt.value}
              onClick={() => setDirection(opt.value)}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-lg text-[13px] transition-colors",
                direction === opt.value
                  ? cn("bg-white font-bold shadow-[0_1px_3px_rgba(21,40,30,.12)]", opt.active)
                  : "font-semibold text-ink-faint hover:text-ink-soft",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label className={FIELD_LABEL} htmlFor="tx-label">Descrição</Label>
          <Input
            id="tx-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Compra de embalagens"
            className={FIELD_INPUT}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL} htmlFor="tx-amount">Valor</Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-ink">
                R$
              </span>
              <Input
                id="tx-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150,00"
                inputMode="decimal"
                className={cn(FIELD_INPUT, "tabular pl-10 text-[15px] font-bold")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL} htmlFor="tx-date">Data</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className={FIELD_LABEL}>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={cn(FIELD_INPUT, "w-full data-[size=default]:h-11")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINANCE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className={FIELD_LABEL} htmlFor="tx-note">Observação</Label>
          <Textarea
            id="tx-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcional"
            className="min-h-16 rounded-[11px] border-[#DDE7D8] px-3.5 py-3 text-[13.5px]"
          />
        </div>
      </div>

      <SheetFooter
        className={cn(
          "border-t border-border",
          editingTx ? "flex-row items-center justify-between" : "flex-row gap-2",
        )}
      >
        {editingTx && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleDelete}
            disabled={pending}
            className="h-[42px] gap-[7px] rounded-[11px] px-3.5 text-[13px] font-semibold text-[#C0492F] hover:bg-danger-wash hover:text-[#C0492F]"
          >
            <Trash2 className="size-4" />
            Excluir
          </Button>
        )}
        <span className={cn("flex gap-2", !editingTx && "flex-1")}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className={cn(
              "h-[42px] rounded-[11px] border-[#DDE7D8] bg-white px-4 text-[13px] font-semibold text-ink-soft",
              !editingTx && "flex-1",
            )}
          >
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !label.trim() || !amount.trim()}
            className={cn("h-[42px] rounded-[11px] px-5 text-[13px] font-semibold", !editingTx && "flex-1")}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </span>
      </SheetFooter>
    </>
  );
}

function LinkedTxView({
  storeId,
  tx,
  stockItemNames,
}: {
  storeId: string;
  tx: FinanceTx;
  stockItemNames: Record<string, string>;
}) {
  const isStock = tx.source === "stock";
  const originId = isStock ? tx.stockItemId : tx.orderId;
  const originHref = originId
    ? isStock
      ? `/s/${storeId}/estoque?item=${originId}`
      : `/s/${storeId}/pedidos?order=${originId}`
    : null;
  const originLabel = isStock
    ? (originId && stockItemNames[originId]) || "Item removido"
    : originId
      ? `Pedido #${orderCode(originId)}`
      : "Pedido removido";
  const originMeta = isStock
    ? `Estoque · entrada de ${dayMonth(tx.date)}`
    : `Pedidos · ${dayMonth(tx.date)}`;
  const calloutText = isStock
    ? "Para alterar valor ou data, edite a entrada de estoque. A movimentação é atualizada junto."
    : "Para alterar valor ou data, edite o pedido. A movimentação é atualizada junto.";

  return (
    <div className="flex-1 space-y-4 p-[22px]">
      <div className="flex items-center gap-3">
        <TxIcon direction={tx.direction} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">{tx.label}</span>
          <span className="block text-[12px] text-[#A0AC9D]">{formatDate(tx.date)}</span>
        </span>
        <TxAmount tx={tx} className="shrink-0 text-[18px]" />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-[#F7FAF5] px-4 py-3.5">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-white text-ink-soft">
          <Lock className="size-4" />
        </span>
        <span className="flex-1 text-[12.5px]">
          <span className="block font-bold text-ink">Valor controlado pela origem</span>
          <span className="mt-0.5 block text-ink-faint text-wrap-pretty">{calloutText}</span>
        </span>
      </div>

      <div className="space-y-2">
        <Label className={FIELD_LABEL}>Origem</Label>
        {originHref ? (
          <Link
            href={originHref}
            className="flex items-center gap-3 rounded-xl border border-[#DDE7D8] px-3.5 py-[13px] transition-colors hover:bg-mist"
          >
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#EEF3EA] text-primary">
              {isStock ? <Package className="size-4" /> : <ShoppingBag className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">
                {originLabel}
              </span>
              <span className="block truncate text-[11.5px] text-[#A0AC9D]">{originMeta}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-primary" />
          </Link>
        ) : (
          <span className="flex items-center gap-3 rounded-xl border border-border p-3.5 opacity-60">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-mist text-ink-faint">
              {isStock ? <Package className="size-4" /> : <ShoppingBag className="size-4" />}
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink-faint">
              {originLabel}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
