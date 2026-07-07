"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  PackageOpen,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { StockItem, StockMovement } from "@/lib/types";
import { formatBRL, formatQty, formatRelative, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyMovementAction, listMovementsAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MovementSheetProps {
  storeId: string;
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: StockItem) => void;
}

export function MovementSheet({
  storeId,
  item,
  open,
  onOpenChange,
  onEdit,
}: MovementSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {item && (
          <>
            <SheetHeader className="border-b border-border">
              {/* pr-8 keeps the edit button clear of the sheet's built-in close X */}
              <div className="flex items-center justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <SheetTitle className="truncate text-[17px] font-bold">
                    {item.name}
                  </SheetTitle>
                  <p className="tabular text-[12px] text-ink-faint">
                    {item.tracked
                      ? `${item.sealed} ${item.pkgLabel ?? "emb."} lacradas · ${formatQty(item.open, item.unit)} abertos · total ${formatQty(item.qty, item.unit)}`
                      : `${formatQty(item.qty, item.unit)} em estoque`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onEdit(item)}
                  aria-label="Editar item"
                  className="shrink-0 rounded-lg"
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
            </SheetHeader>
            <MovementForm
              key={item.id}
              storeId={storeId}
              item={item}
              onClose={() => onOpenChange(false)}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MovementForm({
  storeId,
  item,
  onClose,
}: {
  storeId: string;
  item: StockItem;
  onClose: () => void;
}) {
  const [type, setType] = useState<"entrada" | "saida">("entrada");
  const [byPackage, setByPackage] = useState(item.tracked);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMovementsAction(storeId, item.id)
      .then((list) => {
        if (!cancelled) setMovements(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, item.id, pending]);

  function submit() {
    const parsedQty = Number(qty.replace(",", "."));
    if (!parsedQty || parsedQty <= 0) {
      toast.error("Informe a quantidade.");
      return;
    }
    let parsedPrice: number | undefined;
    if (price.trim()) {
      try {
        parsedPrice = parseBRL(price);
      } catch {
        toast.error("Preço inválido.");
        return;
      }
    }
    startTransition(async () => {
      const result = await applyMovementAction({
        storeId,
        itemId: item.id,
        type,
        qty: parsedQty,
        byPackage: item.tracked ? byPackage : false,
        price: parsedPrice,
        reason: reason || undefined,
      });
      if (result.ok) {
        toast.success(type === "entrada" ? "Entrada registrada." : "Saída registrada.");
        setQty("");
        setPrice("");
        setReason("");
      } else {
        toast.error(result.error);
      }
    });
  }

  function abrirPacote() {
    startTransition(async () => {
      const result = await applyMovementAction({
        storeId,
        itemId: item.id,
        type: "abertura",
        qty: 1,
        byPackage: true,
      });
      if (result.ok) {
        toast.success(`1 ${item.pkgLabel ?? "embalagem"} aberto.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-4 p-4">
        {item.tracked && (
          <Button
            variant="outline"
            onClick={abrirPacote}
            disabled={pending || item.sealed < 1}
            className="w-full gap-2 rounded-xl border-dashed"
          >
            <PackageOpen className="size-4 text-primary" />
            Abrir 1 {item.pkgLabel ?? "embalagem"}{" "}
            <span className="tabular text-ink-faint">
              (+{formatQty(item.pkgSize ?? 0, item.unit)} aberto)
            </span>
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("entrada")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
              type === "entrada"
                ? "border-primary bg-mint-wash text-primary"
                : "border-border bg-card text-ink-soft",
            )}
          >
            <ArrowDownToLine className="size-4" />
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setType("saida")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
              type === "saida"
                ? "border-destructive bg-danger-wash text-destructive"
                : "border-border bg-card text-ink-soft",
            )}
          >
            <ArrowUpFromLine className="size-4" />
            Saída
          </button>
        </div>

        {item.tracked && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setByPackage(true)}
              className={cn(
                "rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                byPackage
                  ? "border-primary bg-mist text-primary"
                  : "border-border bg-card text-ink-soft",
              )}
            >
              Por {item.pkgLabel ?? "embalagem"}
            </button>
            <button
              type="button"
              onClick={() => setByPackage(false)}
              className={cn(
                "rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                !byPackage
                  ? "border-primary bg-mist text-primary"
                  : "border-border bg-card text-ink-soft",
              )}
            >
              Por {item.unit}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mv-qty">
              Quantidade{" "}
              {item.tracked && byPackage
                ? `(${item.pkgLabel ?? "emb."})`
                : `(${item.unit})`}
            </Label>
            <Input
              id="mv-qty"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="0"
              inputMode="decimal"
              className="rounded-xl tabular"
            />
          </div>
          {type === "entrada" && (
            <div className="space-y-1.5">
              <Label htmlFor="mv-price">Custo total (opcional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                  R$
                </span>
                <Input
                  id="mv-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="rounded-xl pl-9 tabular"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mv-reason">Motivo / referência (opcional)</Label>
          <Input
            id="mv-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "entrada" ? "Compra fornecedor X" : "Produção do dia"}
            className="rounded-xl"
          />
        </div>

        {item.cost != null && (
          <p className="text-[11.5px] text-ink-faint">
            Custo cadastrado: {formatBRL(item.cost)}{" "}
            {item.tracked ? `por ${item.pkgLabel ?? "embalagem"}` : `por ${item.unit}`}
            {item.resellable && item.sellPrice != null && (
              <> · venda {formatBRL(item.sellPrice)}</>
            )}
            {item.yieldPct != null && <> · rendimento {item.yieldPct}%</>}
          </p>
        )}
        {movements && movements.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Últimas movimentações
            </p>
            <ul className="space-y-1.5">
              {movements.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-paper px-3 py-2 text-[12px]"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      m.type === "entrada" && "bg-mint-wash text-primary",
                      m.type === "saida" && "bg-danger-wash text-destructive",
                      m.type === "abertura" && "bg-amber-wash text-amber",
                    )}
                  >
                    {m.type === "entrada" ? (
                      <ArrowDownToLine className="size-3.5" />
                    ) : m.type === "saida" ? (
                      <ArrowUpFromLine className="size-3.5" />
                    ) : (
                      <PackageOpen className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="tabular block font-semibold text-ink">
                      {m.type === "abertura"
                        ? `Abriu 1 ${item.pkgLabel ?? "embalagem"}`
                        : `${m.qty} ${m.byPackage ? (item.pkgLabel ?? "emb.") : item.unit}`}
                    </span>
                    {m.reason && (
                      <span className="block truncate text-ink-faint">{m.reason}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-ink-faint">
                    {formatRelative(m.at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Fechar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !qty.trim()}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Registrar {type === "entrada" ? "entrada" : "saída"}
        </Button>
      </SheetFooter>
    </>
  );
}
