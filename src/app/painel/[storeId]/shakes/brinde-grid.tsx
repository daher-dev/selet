"use client";

import { useTransition } from "react";
import { Archive, Gift, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Product, ShakeBrinde } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { PRODUCT_CATEGORY_META } from "@/components/category-meta";
import { EmptyState } from "@/components/ui/empty-state";
import { setShakeBrindeArchivedAction } from "@/actions/shakes";
import { StatusPill } from "./shakes-client";

interface BrindeGridProps {
  storeId: string;
  brindes: ShakeBrinde[];
  productById: Map<string, Product>;
  onCreate: () => void;
}

/**
 * A brinde has no insumo/tiers of its own (it's a pure join against a
 * Product), so it's structurally incompatible with the generic ModifierGrid<T>
 * used by bases/bordas/adicionais/utensílios — this is a bespoke grid.
 */
export function BrindeGrid({ storeId, brindes, productById, onCreate }: BrindeGridProps) {
  if (brindes.length === 0) {
    return (
      <EmptyState
        icon={Gift}
        title="Nenhum brinde ainda"
        description="Adicione itens do cardápio para saírem de graça junto com o shake (ex.: Chá Limão)."
        action={
          <button
            type="button"
            onClick={onCreate}
            className="rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white"
          >
            Adicionar brinde
          </button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {brindes.map((b) => (
        <BrindeCard key={b.id} storeId={storeId} brinde={b} product={productById.get(b.productId)} />
      ))}

      <button
        type="button"
        onClick={onCreate}
        className="flex min-h-[128px] flex-col items-start justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-primary/40 p-4 text-left transition-colors hover:border-primary/70"
      >
        <span className="text-[14px] font-bold text-primary">+ Adicionar brinde</span>
        <span className="text-[12px] text-ink-faint">Qualquer item do cardápio</span>
      </button>
    </div>
  );
}

function BrindeCard({
  storeId,
  brinde,
  product,
}: {
  storeId: string;
  brinde: ShakeBrinde;
  product: Product | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const missing = !product;
  const name = product?.name ?? brinde.name;
  const listPrice = product?.price ?? 0;
  const meta = product ? PRODUCT_CATEGORY_META[product.category] : undefined;

  function toggleArchived() {
    startTransition(async () => {
      const result = await setShakeBrindeArchivedAction({
        storeId,
        productId: brinde.productId,
        archived: !brinde.archived,
      });
      if (result.ok) {
        toast.success(brinde.archived ? "Brinde restaurado." : "Brinde arquivado.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3.5 rounded-2xl border p-4",
        !brinde.archived && !missing
          ? "border-border bg-card"
          : "border-dashed border-border/70 bg-paper opacity-80",
      )}
    >
      <button
        type="button"
        onClick={toggleArchived}
        disabled={pending}
        aria-label={brinde.archived ? "Restaurar brinde" : "Arquivar brinde"}
        title={brinde.archived ? "Restaurar" : "Arquivar"}
        className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full border border-border bg-white text-ink-faint transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
      >
        {brinde.archived ? (
          <RotateCcw className="size-3.5" strokeWidth={2} />
        ) : (
          <Archive className="size-3.5" strokeWidth={2} />
        )}
      </button>

      <div className="flex items-start justify-between gap-2 pr-8">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {meta?.label ?? "Sem categoria"}
          </span>
          <span className="mt-0.5 block truncate text-[14.5px] font-bold text-ink">{name}</span>
        </span>
        <StatusPill active={!brinde.archived} />
      </div>

      {missing && (
        <p className="text-[11.5px] text-amber">Produto não encontrado ou inativo no cardápio.</p>
      )}

      <div className="mt-auto flex items-center gap-2 rounded-[10px] border border-mint-wash bg-mist px-3 py-2.5">
        <span className="flex-1 text-[12px] text-ink-soft">Com o shake</span>
        <span className="text-[12px] text-ink-faint line-through">{formatBRL(listPrice)}</span>
        <span className="text-[13.5px] font-bold text-primary">R$ 0,00</span>
      </div>
    </div>
  );
}
