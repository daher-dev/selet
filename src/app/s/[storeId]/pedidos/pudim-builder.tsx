"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import {
  type OrderItem,
  type Product,
  type PudimBase,
  type PudimFlavor,
  type PudimMixin,
  type PudimUtensil,
} from "@/lib/types";
import { formatBRL, formatPudimLineName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Price for a given tier quantity, or 0 if that exact quantity has no tier. */
function tierPrice(tiers: { qty: number; price: number }[], qty: number): number {
  return tiers.find((t) => t.qty === qty)?.price ?? 0;
}

/**
 * A brinde offered in the pudim builder — the PudimBrinde catalog entry
 * joined with its LIVE Product (name/price/category/adicionais), since a
 * PudimBrinde doc itself carries no price or recipe of its own. `price` is
 * the struck-through menu price; the pudim line always charges 0 for it.
 */
export interface PudimBrindeOption {
  productId: string;
  name: string;
  price: number;
  category: string;
  adicionais: Product["adicionais"];
}

interface PudimBuilderProps {
  flavors: PudimFlavor[];
  bases: PudimBase[];
  mixins: PudimMixin[];
  utensils: PudimUtensil[];
  brindes: PudimBrindeOption[];
  onConfirm: (item: OrderItem) => void;
}

export function PudimBuilder({
  flavors,
  bases,
  mixins,
  utensils,
  brindes,
  onConfirm,
}: PudimBuilderProps) {
  const [flavorId, setFlavorId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [mixinQty, setMixinQty] = useState<Map<string, number>>(new Map());
  const [utensilOverrides, setUtensilOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [showUtensils, setShowUtensils] = useState(false);
  // Nothing pre-selected — defaults to "Sem brinde" (mirrors ShakeBuilder).
  const [brindeProductId, setBrindeProductId] = useState<string | null>(null);
  const [brindeAddonNames, setBrindeAddonNames] = useState<string[]>([]);

  const flavor = flavorId ? (flavors.find((f) => f.id === flavorId) ?? null) : null;
  const base = baseId ? (bases.find((b) => b.id === baseId) ?? null) : null;
  const selectedBrinde = brindes.find((b) => b.productId === brindeProductId) ?? null;

  const mixinsTotal = [...mixinQty.entries()].reduce((s, [id, qty]) => {
    const mixin = mixins.find((m) => m.id === id);
    return s + (mixin ? tierPrice(mixin.tiers, qty) : 0);
  }, 0);
  // The brinde's own price is never charged — only its selected addons are.
  const brindeAddonsTotal = (selectedBrinde?.adicionais ?? [])
    .filter((a) => brindeAddonNames.includes(a.name))
    .reduce((s, a) => s + a.price, 0);
  const unitPrice = (flavor?.price ?? 0) + (base?.price ?? 0) + mixinsTotal + brindeAddonsTotal;

  // Selecting a different brinde (or "Sem brinde") always clears its addons.
  function selectBrinde(productId: string | null) {
    setBrindeProductId(productId);
    setBrindeAddonNames([]);
  }

  function toggleBrindeAddon(name: string) {
    setBrindeAddonNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function toggleMixin(id: string) {
    const next = new Map(mixinQty);
    if (next.has(id)) next.delete(id);
    else {
      const tiers = mixins.find((m) => m.id === id)?.tiers ?? [];
      next.set(id, [...tiers].sort((a, b) => a.qty - b.qty)[0]?.qty ?? 1);
    }
    setMixinQty(next);
  }

  function setMixinTierQty(id: string, qty: number) {
    setMixinQty(new Map(mixinQty).set(id, qty));
  }

  function confirm() {
    if (!flavorId || !flavor) return;
    const mixinSel = [...mixinQty.entries()].map(([modifierId, qty]) => ({
      modifierId,
      qty,
    }));
    const overrides = [...utensilOverrides.entries()]
      .filter(([id, included]) => {
        const u = utensils.find((x) => x.id === id);
        return u ? u.defaultIncluded !== included : false;
      })
      .map(([utensilId, included]) => ({ utensilId, included }));

    const name = formatPudimLineName({
      flavor: flavor.name,
      base: base?.name,
      mixins: mixinSel.map(({ modifierId, qty }) => ({
        name: mixins.find((m) => m.id === modifierId)?.name ?? "",
        qty,
      })),
    });

    const brinde = selectedBrinde
      ? {
          productId: selectedBrinde.productId,
          name: selectedBrinde.name,
          listPrice: selectedBrinde.price,
          ...(brindeAddonNames.length > 0
            ? {
                addons: selectedBrinde.adicionais
                  .filter((a) => brindeAddonNames.includes(a.name))
                  .map((a) => ({ name: a.name, price: a.price })),
              }
            : {}),
        }
      : undefined;

    onConfirm({
      productId: flavor.id,
      name,
      qty: 1,
      unitPrice,
      pudim: {
        flavorId,
        baseId,
        mixins: mixinSel,
        ...(overrides.length > 0 ? { utensilOverrides: overrides } : {}),
        ...(brinde ? { brinde } : {}),
      },
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Sabor</Label>
            <span className="text-[11px] text-ink-faint">escolha 1</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {flavors.map((f) => {
              const active = f.id === flavorId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFlavorId(active ? null : f.id)}
                  className={cn(
                    "flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-mist"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <span className="truncate text-[13px] font-semibold text-ink">
                    {f.name}
                  </span>
                  <span className="tabular text-[11px] text-ink-faint">
                    {formatBRL(f.price)}
                  </span>
                </button>
              );
            })}
            {flavors.length === 0 && (
              <p className="col-span-2 text-[12px] text-ink-faint">
                Nenhum sabor cadastrado.
              </p>
            )}
          </div>
        </div>

        {bases.length > 0 && (
          <div className="space-y-2">
            <Label>Base</Label>
            <div className="space-y-1.5">
              {bases.map((b) => {
                const active = b.id === baseId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBaseId(active ? null : b.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-mist"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {b.name}
                    </span>
                    <span className="tabular shrink-0 text-[11.5px] font-semibold text-ink-faint">
                      {b.price > 0 ? `+ ${formatBRL(b.price)}` : "Incluso"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mixins.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Adicionais</Label>
              <span className="text-[11px] text-ink-faint">quantos quiser</span>
            </div>
            <ul className="space-y-1.5">
              {mixins.map((item) => {
                const qty = mixinQty.get(item.id);
                const active = qty !== undefined;
                const tiers = [...item.tiers].sort((a, b) => a.qty - b.qty);
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 transition-colors",
                      active ? "border-primary bg-mist" : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMixin(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                            active
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-paper text-transparent",
                          )}
                        >
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {item.name}
                        </span>
                      </button>
                      {active && (
                        <button
                          type="button"
                          onClick={() => toggleMixin(item.id)}
                          aria-label={`Remover ${item.name}`}
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-danger-wash hover:text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {active && tiers.length > 1 && (
                      <div className="mt-2 flex gap-1.5 pl-7">
                        {tiers.map((t) => (
                          <button
                            key={t.qty}
                            type="button"
                            onClick={() => setMixinTierQty(item.id, t.qty)}
                            className={cn(
                              "rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors",
                              qty === t.qty
                                ? "border-primary bg-primary text-white"
                                : "border-border bg-paper text-ink-soft",
                            )}
                          >
                            {t.qty}× · {formatBRL(t.price)}
                          </button>
                        ))}
                      </div>
                    )}
                    {active && tiers.length <= 1 && (
                      <p className="tabular mt-1 pl-7 text-[11px] text-ink-faint">
                        + {formatBRL(tierPrice(tiers, qty))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {brindes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Brinde</Label>
              <span className="text-[11px] text-ink-faint">incluso, escolha 1</span>
              <span className="h-px flex-1 bg-border" />
              <span className="shrink-0 rounded-full bg-mint-wash px-2 py-0.5 text-[10.5px] font-bold text-primary">
                R$ 0,00
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {brindes.map((b) => {
                const active = b.productId === brindeProductId;
                return (
                  <button
                    key={b.productId}
                    type="button"
                    onClick={() => selectBrinde(b.productId)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors",
                      active
                        ? "border-primary bg-mist text-primary"
                        : "border-border bg-card text-ink hover:border-primary/40",
                    )}
                  >
                    {b.name}
                    <span
                      className={cn(
                        "tabular text-[11.5px] font-semibold line-through",
                        active ? "text-ink-faint" : "text-ink-faint/80",
                      )}
                    >
                      {formatBRL(b.price)}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => selectBrinde(null)}
                className={cn(
                  "flex h-9 items-center rounded-xl border px-3 text-[12.5px] font-semibold transition-colors",
                  brindeProductId === null
                    ? "border-primary bg-mist text-primary"
                    : "border-border bg-card text-ink-faint hover:border-primary/40",
                )}
              >
                Sem brinde
              </button>
            </div>

            {selectedBrinde && selectedBrinde.adicionais.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-ink-faint">Adicionais do brinde</Label>
                  <span className="text-[11px] text-ink-faint">cobrados</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedBrinde.adicionais.map((addon) => {
                    const active = brindeAddonNames.includes(addon.name);
                    return (
                      <button
                        key={addon.name}
                        type="button"
                        onClick={() => toggleBrindeAddon(addon.name)}
                        className={cn(
                          "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors",
                          active
                            ? "border-primary bg-mist text-primary"
                            : "border-border bg-card text-ink hover:border-primary/40",
                        )}
                      >
                        {addon.name}
                        <span className="tabular text-[11.5px]">
                          + {formatBRL(addon.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {utensils.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowUtensils((v) => !v)}
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              {showUtensils ? "Ocultar utensílios" : "Ajustar utensílios"}
            </button>
            {showUtensils && (
              <ul className="space-y-1.5">
                {utensils.map((u) => {
                  const included = utensilOverrides.get(u.id) ?? u.defaultIncluded;
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-paper px-3 py-2"
                    >
                      <span className="truncate text-[12.5px] font-medium text-ink-soft">
                        {u.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setUtensilOverrides(
                            new Map(utensilOverrides).set(u.id, !included),
                          )
                        }
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                          included
                            ? "bg-mint-wash text-primary"
                            : "bg-wash text-ink-faint",
                        )}
                      >
                        {included ? "Incluído" : "Não incluído"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-ink-faint">
            Subtotal
          </span>
          <span className="tabular text-[20px] font-bold text-primary">
            {formatBRL(unitPrice)}
          </span>
        </span>
        <Button
          onClick={confirm}
          disabled={!flavorId}
          className="h-11 gap-1.5 rounded-xl px-5 font-semibold"
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </>
  );
}
