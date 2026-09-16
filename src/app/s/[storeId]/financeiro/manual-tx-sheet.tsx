"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
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
import { CATEGORY_LABELS } from "./finance-shared";
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
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
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
                : `Avulso · criado em ${formatDate(editingTx.date)}${
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
    editingTx ? editingTx.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
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
      <div className="flex-1 space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
              direction === "in"
                ? "border-primary bg-mint-wash text-primary"
                : "border-border bg-card text-ink-soft",
            )}
          >
            <ArrowUpRight className="size-4" />
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
              direction === "out"
                ? "border-destructive bg-danger-wash text-destructive"
                : "border-border bg-card text-ink-soft",
            )}
          >
            <ArrowDownRight className="size-4" />
            Saída
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tx-label">Descrição</Label>
          <Input
            id="tx-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Compra de embalagens"
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tx-amount">Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                R$
              </span>
              <Input
                id="tx-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150,00"
                inputMode="decimal"
                className="rounded-xl pl-9 tabular"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Data</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full rounded-xl">
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
          <Label htmlFor="tx-note">Observação</Label>
          <Textarea
            id="tx-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcional"
            className="rounded-xl"
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
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
            className="gap-1.5 rounded-xl"
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
            className={cn("rounded-xl", !editingTx && "flex-1")}
          >
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !label.trim() || !amount.trim()}
            className={cn("rounded-xl font-semibold", !editingTx && "flex-1")}
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
    ? `Estoque · entrada de ${formatDate(tx.date)}`
    : `Pedidos · ${formatDate(tx.date)}`;
  const calloutText = isStock
    ? "Para alterar valor ou data, edite a entrada de estoque. A movimentação é atualizada junto."
    : "Para alterar valor ou data, edite o pedido. A movimentação é atualizada junto.";

  return (
    <div className="flex-1 space-y-4 p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            tx.direction === "in" ? "bg-mint-wash text-primary" : "bg-danger-wash text-destructive",
          )}
        >
          {tx.direction === "in" ? (
            <ArrowUpRight className="size-4.5" />
          ) : (
            <ArrowDownRight className="size-4.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">{tx.label}</span>
          <span className="block text-[12px] text-ink-faint">{formatDate(tx.date)}</span>
        </span>
        <span
          className={cn(
            "tabular shrink-0 text-[18px] font-bold",
            tx.direction === "in" ? "text-primary" : "text-destructive",
          )}
        >
          {tx.direction === "in" ? "+ " : "− "}
          {formatBRL(tx.amount)}
        </span>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-ink-soft">
          <Lock className="size-4" />
        </span>
        <span className="flex-1 text-[12.5px]">
          <span className="block font-bold text-ink">Valor controlado pela origem</span>
          <span className="mt-0.5 block text-ink-faint text-wrap-pretty">{calloutText}</span>
        </span>
      </div>

      <div className="space-y-1.5">
        <Label>Origem</Label>
        {originHref ? (
          <Link
            href={originHref}
            className="flex items-center gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-mist"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-mint-wash text-primary">
              {isStock ? <Package className="size-4" /> : <ShoppingBag className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">
                {originLabel}
              </span>
              <span className="block truncate text-[11.5px] text-ink-faint">{originMeta}</span>
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
