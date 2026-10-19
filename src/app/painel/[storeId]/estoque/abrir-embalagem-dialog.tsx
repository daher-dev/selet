"use client";

import { useState, useTransition } from "react";
import { Loader2, PackageOpen, Store, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { StockItem, StockLocation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { expectedUses, yieldPercent } from "@/lib/stock-yield";
import { openNextPackageAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RecipeUsage } from "./estoque-detail-sheet";
import { pkgCount } from "./stock-view";

interface Props {
  storeId: string;
  /** The contínuo item whose next package is opened; null keeps the dialog closed. */
  item: StockItem | null;
  usedIn: RecipeUsage[];
  onOpenChange: (open: boolean) => void;
}

/**
 * "Abrir embalagem" (design 2d): confirms the previous package is done (with
 * how well it yielded) and picks where the new one comes from — the Loja's
 * sealed packages, or the Depósito (which transfers and opens in one go).
 */
export function AbrirEmbalagemDialog({ storeId, item, usedIn, onOpenChange }: Props) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-[400px] gap-0 overflow-hidden rounded-[18px] p-0 sm:max-w-[400px]"
      >
        {item && (
          <AbrirForm key={item.id} storeId={storeId} item={item} usedIn={usedIn} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AbrirForm({
  storeId,
  item,
  usedIn,
  onClose,
}: {
  storeId: string;
  item: StockItem;
  usedIn: RecipeUsage[];
  onClose: () => void;
}) {
  const label = item.pkgLabel ?? "embalagem";
  const [from, setFrom] = useState<StockLocation>(item.sealed > 0 || item.depSealed === 0 ? "loja" : "deposito");
  const [pending, startTransition] = useTransition();

  const available = from === "loja" ? item.sealed : item.depSealed;
  const expected = expectedUses(
    item.pkgSize,
    usedIn.flatMap((u) => (u.qty != null ? [u.qty] : [])),
  );
  const pct = item.lastUsos != null ? yieldPercent(item.lastUsos, expected) : undefined;

  function submit() {
    startTransition(async () => {
      const r = await openNextPackageAction(storeId, item.id, from);
      if (r.ok) {
        toast.success("Nova embalagem aberta.");
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <DialogHeader className="gap-0 border-b border-border/70 px-[22px] pb-4 pt-5">
        <span className="text-[11px] font-bold uppercase tracking-[.5px] text-violet">{item.name}</span>
        <DialogTitle className="mt-[3px] text-[18px] font-bold leading-snug">Abrir embalagem</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-[18px] px-[22px] py-5">
        {item.lastUsos != null && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#c9d3cb] bg-[#fafbf9] px-3.5 py-3">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#eef2ec] text-ink-soft">
              <PackageOpen className="size-4" strokeWidth={2} />
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold text-ink">
                {label.charAt(0).toUpperCase() + label.slice(1)} anterior encerrado
              </span>
              <span className="mt-px block text-[12px] text-ink-soft">
                Rendeu {item.lastUsos} {item.lastUsos === 1 ? "uso" : "usos"}
                {pct != null && (
                  <>
                    {" · "}
                    <span className={cn("font-semibold", pct >= 100 ? "text-success" : "text-[#8a5a0f]")}>
                      {pct}% do previsto
                    </span>
                  </>
                )}
              </span>
            </span>
          </div>
        )}

        <div>
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft">
            De onde sai o novo {label}
          </span>
          <div role="radiogroup" aria-label="Origem" className="flex flex-col gap-2">
            <Origin
              checked={from === "loja"}
              disabled={item.sealed === 0}
              onSelect={() => setFrom("loja")}
              icon={<Store className="size-4 text-primary" strokeWidth={2} />}
              name="Loja"
              nameClass="text-primary"
              sub={`${item.sealed} ${pkgCount(item, item.sealed)} lacrado${item.sealed === 1 ? "" : "s"}`}
              subClass="text-[#3d5a47]"
              ring="border-primary bg-mint-wash"
              dot="border-primary"
            />
            <Origin
              checked={from === "deposito"}
              disabled={item.depSealed === 0}
              onSelect={() => setFrom("deposito")}
              icon={<Warehouse className="size-4 text-depot" strokeWidth={2} />}
              name="Depósito"
              nameClass="text-depot"
              sub={`${item.depSealed} ${pkgCount(item, item.depSealed)} lacrado${item.depSealed === 1 ? "" : "s"} · transfere e abre`}
              subClass="text-depot-soft"
              ring="border-depot bg-depot-wash"
              dot="border-depot"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 border-t border-border/70 px-[22px] py-4">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="h-11 rounded-[11px] bg-white px-[18px] text-[13.5px] font-semibold text-ink-soft"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || available < 1}
          className="h-11 flex-1 gap-[7px] rounded-[11px] bg-violet text-[13.5px] font-semibold text-white hover:bg-violet/90"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-[15px]" strokeWidth={2} />}
          Abrir {label}
        </Button>
      </div>
    </>
  );
}

function Origin({
  checked,
  disabled,
  onSelect,
  icon,
  name,
  nameClass,
  sub,
  subClass,
  ring,
  dot,
}: {
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  name: string;
  nameClass: string;
  sub: string;
  subClass: string;
  ring: string;
  dot: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors disabled:opacity-50",
        checked ? cn("border-[1.5px]", ring) : "border border-border bg-white hover:border-primary/30",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">
        <span className={cn("block text-[14px] font-bold", nameClass)}>{name}</span>
        <span className={cn("block text-[12px]", subClass)}>{sub}</span>
      </span>
      <span
        className={cn(
          "size-[18px] shrink-0 rounded-full",
          checked ? cn("border-[5px]", dot) : "border-[1.5px] border-[#b9c3bb]",
        )}
      />
    </button>
  );
}
