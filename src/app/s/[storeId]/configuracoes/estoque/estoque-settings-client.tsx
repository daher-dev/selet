"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteStockCategoryAction, deleteStockUnitAction } from "@/actions/settings";
import { buildStockCategoryMeta } from "@/components/category-meta";
import { usePageHeader } from "@/components/shell/app-shell-context";
import {
  DeleteDialog,
  StockCategoryDialog,
  StockUnitDialog,
} from "@/components/settings-dialogs";
import { Button } from "@/components/ui/button";
import type { StockCategoryDef, StockSettings, StockUnitDef } from "@/lib/stock-settings";
import { cn } from "@/lib/utils";

interface Props {
  storeId: string;
  settings: StockSettings;
  categoryCounts: Record<string, number>;
  unitCounts: Record<string, number>;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");

function itensLabel(n: number) {
  return `${n} ${n === 1 ? "item" : "itens"}`;
}

/** Configurações → Estoque: per-store categories and units of use (design: Mock Configurações 1a, 2a–2d). */
export function EstoqueSettingsClient({ storeId, settings, categoryCounts, unitCounts }: Props) {
  usePageHeader({ title: "Configurações", subtitle: "Cadastros usados no estoque" });
  const meta = buildStockCategoryMeta(settings.categories);
  const categories = [...settings.categories].sort(byName);

  const [catDialog, setCatDialog] = useState<{ open: boolean; category: StockCategoryDef | null }>({
    open: false,
    category: null,
  });
  const [unitDialog, setUnitDialog] = useState<{ open: boolean; unit: StockUnitDef | null }>({
    open: false,
    unit: null,
  });
  const [deletingCat, setDeletingCat] = useState<StockCategoryDef | null>(null);
  const [deletingUnit, setDeletingUnit] = useState<StockUnitDef | null>(null);

  const catCount = deletingCat ? (categoryCounts[deletingCat.id] ?? 0) : 0;
  const unitCount = deletingUnit ? (unitCounts[deletingUnit.id] ?? 0) : 0;
  const lastCategory = settings.categories.length <= 1;

  return (
    <div className="max-w-[1000px] space-y-[18px]">
      {/* ------------------------------------------------------------ Categorias */}
      <Card
        title="Categorias"
        subtitle="Agrupam os itens no estoque."
        action={
          <Button
            type="button"
            onClick={() => setCatDialog({ open: true, category: null })}
            className="h-9 gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Nova categoria
          </Button>
        }
      >
        <ul>
          {categories.map((c) => {
            const m = meta[c.id];
            const Icon = m.icon;
            const n = categoryCounts[c.id] ?? 0;
            return (
              <li key={c.id} className="flex items-center gap-3 border-t border-[#F0F4ED] px-4 py-[11px]">
                <span className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-[9px]", m.bg, m.fg)}>
                  <Icon className="size-[15px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{c.name}</span>
                <span className="text-[13px] text-ink-faint">{itensLabel(n)}</span>
                <RowActions
                  label={c.name}
                  onEdit={() => setCatDialog({ open: true, category: c })}
                  onDelete={() => setDeletingCat(c)}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ------------------------------------------------------------ Unidades de uso */}
      <Card
        title="Unidades de uso"
        subtitle="Medida usada na baixa de estoque a cada preparo."
        action={
          <Button
            type="button"
            onClick={() => setUnitDialog({ open: true, unit: null })}
            className="h-9 gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Nova unidade
          </Button>
        }
      >
        <div className="grid min-[820px]:grid-cols-2">
          {(
            [
              ["count", "Contagem", "baixa por quantidade usada"],
              ["measure", "Medida contínua", "baixa por embalagem aberta"],
            ] as const
          ).map(([kind, title, hint]) => (
            <div key={kind}>
              <div className="px-4 pb-2 pt-3.5 text-[11px] font-bold uppercase tracking-[.6px] text-ink-faint">
                {title} <span className="font-medium normal-case tracking-normal text-[#A0AC9D]">· {hint}</span>
              </div>
              <ul>
                {settings.units
                  .filter((u) => u.kind === kind)
                  .map((u) => (
                    <li key={u.id} className="flex items-center gap-3 border-t border-[#F0F4ED] px-4 py-[11px]">
                      <span className="flex h-8 min-w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3F8EF] px-2.5 text-[12.5px] font-bold text-primary">
                        {u.symbol}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{u.name}</span>
                      <RowActions
                        label={u.name}
                        onEdit={() => setUnitDialog({ open: true, unit: u })}
                        onDelete={() => setDeletingUnit(u)}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <StockCategoryDialog
        storeId={storeId}
        open={catDialog.open}
        onOpenChange={(open) => setCatDialog((d) => ({ ...d, open }))}
        category={catDialog.category}
      />
      <StockUnitDialog
        storeId={storeId}
        open={unitDialog.open}
        onOpenChange={(open) => setUnitDialog((d) => ({ ...d, open }))}
        unit={unitDialog.unit}
        usage={unitDialog.unit ? (unitCounts[unitDialog.unit.id] ?? 0) : 0}
      />

      <DeleteDialog
        open={deletingCat !== null}
        onOpenChange={(open) => !open && setDeletingCat(null)}
        title={`Excluir categoria ${deletingCat?.name ?? ""}?`}
        description={
          catCount > 0
            ? `${itensLabel(catCount)} do estoque ${catCount === 1 ? "está" : "estão"} nesta categoria. Escolha para onde movê-${catCount === 1 ? "lo" : "los"} antes de excluir.`
            : "Nenhum item está nesta categoria. A ação não pode ser desfeita."
        }
        confirmLabel={catCount > 0 ? "Mover e excluir" : "Excluir categoria"}
        moveLabel={`Mover ${catCount === 1 ? "item" : "itens"} para`}
        moveOptions={
          catCount > 0
            ? categories.filter((c) => c.id !== deletingCat?.id).map((c) => ({ id: c.id, name: c.name }))
            : undefined
        }
        blockedReason={lastCategory ? "Mantenha pelo menos uma categoria no estoque." : undefined}
        onConfirm={(moveToId) => deleteStockCategoryAction(storeId, deletingCat!.id, moveToId)}
      />
      <DeleteDialog
        open={deletingUnit !== null}
        onOpenChange={(open) => !open && setDeletingUnit(null)}
        title={`Excluir unidade ${deletingUnit?.symbol ?? ""}?`}
        description="Nenhum item usa esta unidade. A ação não pode ser desfeita."
        confirmLabel="Excluir unidade"
        blockedReason={
          unitCount > 0
            ? `${itensLabel(unitCount)} ${unitCount === 1 ? "usa" : "usam"} esta unidade. Troque a unidade ${unitCount === 1 ? "dele" : "deles"} no Estoque antes de excluir.`
            : undefined
        }
        onConfirm={() => deleteStockUnitAction(storeId, deletingUnit!.id)}
      />
    </div>
  );
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E7EEE6] bg-white">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function RowActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const btn = "flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-mist hover:text-ink";
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label={`Editar ${label}`} onClick={onEdit} className={btn}>
        <Pencil className="size-[15px]" strokeWidth={1.8} />
      </button>
      <button type="button" aria-label={`Excluir ${label}`} onClick={onDelete} className={btn}>
        <Trash2 className="size-[15px]" strokeWidth={1.8} />
      </button>
    </span>
  );
}
