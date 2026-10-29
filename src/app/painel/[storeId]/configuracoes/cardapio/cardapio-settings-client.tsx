"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteProductCategoryAction, moveProductCategoryAction } from "@/actions/settings";
import { buildProductCategoryMeta } from "@/components/category-meta";
import { usePageHeader } from "@/components/shell/app-shell-context";
import { DeleteDialog, StockCategoryDialog } from "@/components/settings-dialogs";
import { Button } from "@/components/ui/button";
import type { ProductCategoryDef, ProductSettings } from "@/lib/stock-settings";
import { cn } from "@/lib/utils";
import { RowActions } from "../estoque/estoque-settings-client";

interface Props {
  storeId: string;
  settings: ProductSettings;
  categoryCounts: Record<string, number>;
}

function itensLabel(n: number) {
  return `${n} ${n === 1 ? "item" : "itens"}`;
}

/** Configurações → Cardápio: per-store menu categories, in display order (design: configuracoes-cardapio). */
export function CardapioSettingsClient({ storeId, settings, categoryCounts }: Props) {
  usePageHeader({ title: "Configurações", subtitle: "Categorias do cardápio" });
  const meta = buildProductCategoryMeta(settings.categories);
  const categories = settings.categories;
  const [dialog, setDialog] = useState<{ open: boolean; category: ProductCategoryDef | null }>({
    open: false,
    category: null,
  });
  const [deleting, setDeleting] = useState<ProductCategoryDef | null>(null);
  const [pending, startTransition] = useTransition();

  const count = deleting ? (categoryCounts[deleting.id] ?? 0) : 0;

  function move(id: string, dir: "up" | "down") {
    startTransition(async () => {
      const r = await moveProductCategoryAction(storeId, id, dir);
      if (!r.ok) toast.error(r.error ?? "Algo deu errado.");
    });
  }

  const arrow =
    "flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="max-w-[1000px] space-y-[18px]">
      <section className="overflow-hidden rounded-2xl border border-[#E7EEE6] bg-white">
        <header className="flex items-center gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-ink">Categorias do cardápio</h2>
            <p className="mt-0.5 text-[13px] text-ink-faint">Agrupam os itens no Cardápio e nos Pedidos, na ordem abaixo.</p>
          </div>
          <Button
            type="button"
            onClick={() => setDialog({ open: true, category: null })}
            className="h-9 gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Nova categoria
          </Button>
        </header>
        <ul>
          {categories.map((c, i) => {
            const m = meta[c.id];
            const Icon = m.icon;
            return (
              <li key={c.id} className="flex items-center gap-3 border-t border-[#F0F4ED] px-4 py-[11px]">
                <span className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-[9px]", m.bg, m.fg)}>
                  <Icon className="size-[15px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{c.name}</span>
                <span className="text-[13px] text-ink-faint">{itensLabel(categoryCounts[c.id] ?? 0)}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={`Subir ${c.name}`} disabled={pending || i === 0} onClick={() => move(c.id, "up")} className={arrow}>
                    <ArrowUp className="size-[15px]" strokeWidth={1.8} />
                  </button>
                  <button type="button" aria-label={`Descer ${c.name}`} disabled={pending || i === categories.length - 1} onClick={() => move(c.id, "down")} className={arrow}>
                    <ArrowDown className="size-[15px]" strokeWidth={1.8} />
                  </button>
                </span>
                <RowActions
                  label={c.name}
                  onEdit={() => setDialog({ open: true, category: c })}
                  onDelete={() => setDeleting(c)}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <StockCategoryDialog
        kind="product"
        storeId={storeId}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        category={dialog.category}
      />
      <DeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Excluir categoria ${deleting?.name ?? ""}?`}
        description={
          count > 0
            ? `${itensLabel(count)} do cardápio ${count === 1 ? "está" : "estão"} nesta categoria. Escolha para onde movê-${count === 1 ? "lo" : "los"} antes de excluir.`
            : "Nenhum item está nesta categoria. A ação não pode ser desfeita."
        }
        confirmLabel={count > 0 ? "Mover e excluir" : "Excluir categoria"}
        moveLabel={`Mover ${count === 1 ? "item" : "itens"} para`}
        moveOptions={
          count > 0
            ? categories.filter((c) => c.id !== deleting?.id).map((c) => ({ id: c.id, name: c.name }))
            : undefined
        }
        blockedReason={categories.length <= 1 ? "Mantenha pelo menos uma categoria no cardápio." : undefined}
        onConfirm={(moveToId) => deleteProductCategoryAction(storeId, deleting!.id, moveToId)}
      />
    </div>
  );
}
