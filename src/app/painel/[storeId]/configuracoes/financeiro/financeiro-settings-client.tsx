"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { deleteFinanceCategoryAction } from "@/actions/settings";
import { usePageHeader } from "@/components/shell/app-shell-context";
import { DeleteDialog, FinanceCategoryDialog } from "@/components/settings-dialogs";
import { Button } from "@/components/ui/button";
import {
  PALETTE,
  financeCategoriesFor,
  type FinanceCategoryDef,
  type FinanceSettings,
} from "@/lib/stock-settings";
import { RowActions } from "../estoque/estoque-settings-client";

function lancamentos(n: number) {
  return `${n} ${n === 1 ? "lançamento" : "lançamentos"}`;
}

/** Configurações → Financeiro: lançamento categories, Saídas | Entradas (design: Mock Configurações 1c). */
export function FinanceiroSettingsClient({
  storeId,
  settings,
  counts,
}: {
  storeId: string;
  settings: FinanceSettings;
  counts: Record<string, number>;
}) {
  usePageHeader({ title: "Configurações", subtitle: "Cadastros usados no financeiro" });
  const [dialog, setDialog] = useState<{ open: boolean; category: FinanceCategoryDef | null }>({
    open: false,
    category: null,
  });
  const [deleting, setDeleting] = useState<FinanceCategoryDef | null>(null);
  const n = deleting ? (counts[deleting.id] ?? 0) : 0;
  const sameDirection = deleting
    ? financeCategoriesFor(settings.categories, deleting.direction).filter((c) => c.id !== deleting.id)
    : [];

  return (
    <div className="max-w-[1000px]">
      <section className="overflow-hidden rounded-2xl border border-[#E7EEE6] bg-white">
        <header className="flex items-center gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-ink">Categorias de lançamentos</h2>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              Usadas ao registrar entradas e saídas avulsas no Financeiro.
            </p>
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
        <div className="grid min-[820px]:grid-cols-2">
          {(
            [
              ["out", "Saídas"],
              ["in", "Entradas"],
            ] as const
          ).map(([direction, title]) => (
            <div key={direction}>
              <div className="px-4 pb-2 pt-3.5 text-[11px] font-bold uppercase tracking-[.6px] text-ink-faint">
                {title}
              </div>
              <ul>
                {financeCategoriesFor(settings.categories, direction).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 border-t border-[#F0F4ED] px-4 py-[14px]">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[c.color]?.hex }} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{c.name}</span>
                    <span className="text-[13px] text-ink-faint">{lancamentos(counts[c.id] ?? 0)}</span>
                    <RowActions
                      label={c.name}
                      onEdit={() => setDialog({ open: true, category: c })}
                      onDelete={() => setDeleting(c)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <FinanceCategoryDialog
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
          n > 0
            ? `${lancamentos(n)} ${n === 1 ? "está" : "estão"} nesta categoria. Escolha para onde movê-${n === 1 ? "lo" : "los"} antes de excluir.`
            : "Nenhum lançamento está nesta categoria. A ação não pode ser desfeita."
        }
        confirmLabel={n > 0 ? "Mover e excluir" : "Excluir categoria"}
        moveLabel={`Mover ${n === 1 ? "lançamento" : "lançamentos"} para`}
        moveOptions={n > 0 ? sameDirection.map((c) => ({ id: c.id, name: c.name })) : undefined}
        blockedReason={
          deleting?.system
            ? "Esta categoria alimenta o resumo do Financeiro e não pode ser excluída. Você pode renomeá-la."
            : n > 0 && sameDirection.length === 0
              ? "Crie outra categoria do mesmo tipo para mover os lançamentos antes de excluir."
              : undefined
        }
        onConfirm={(moveToId) => deleteFinanceCategoryAction(storeId, deleting!.id, moveToId)}
      />
    </div>
  );
}
