"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  adjustOpenBalance,
  applyMovement,
  createStockItem,
  deleteMovement,
  deleteStockItem,
  getStockItem,
  listMovementsPage,
  markPackageEmpty,
  openNextPackage,
  transferToStore,
  updateMovement,
  updateStockItem,
  type MovementPage,
} from "@/data/stock";
import type { MovementKind } from "@/lib/stock-ledger";
import { logActivity } from "@/data/activity";
import { listProducts } from "@/data/products";
import {
  listShakeBases,
  listShakeFlavors,
  listShakeMixins,
  listShakeRims,
  listShakeUtensils,
} from "@/data/shakes";
import {
  CONSUMPTION_MODES,
  MANUAL_MOVEMENT_TYPES,
  OPEN_ADJUST_REASONS,
  STOCK_LOCATIONS,
  STOCK_MOVEMENT_REASONS,
} from "@/lib/types";
import { expectedUses, lastPackageNote } from "@/lib/stock-yield";
import { zonedDateToInstant } from "@/lib/timezone";
import { getStockSettings } from "@/data/settings";
import { unitKind, unitLabelFrom, type StockSettings } from "@/lib/stock-settings";
import type { ActionResult } from "./products";

const itemSchema = z
  .object({
    storeId: z.string().min(1),
    name: z.string().trim().min(1, "Informe o nome do item."),
    category: z.string().min(1, "Escolha a categoria."),
    unit: z.string().min(1, "Escolha a unidade de uso."),
    tracked: z.boolean(),
    pkgLabel: z.string().trim().optional(),
    pkgLabelPlural: z.string().trim().optional(),
    pkgSize: z.number().positive().optional(),
    continuousUse: z.boolean().default(false),
    consumptionMode: z.enum(CONSUMPTION_MODES).optional(),
    resellable: z.boolean().default(false),
    cost: z.number().int().nonnegative().optional(),
    sellPrice: z.number().int().nonnegative().optional(),
    reorderAt: z.number().nonnegative().default(0),
    yieldPct: z.number().min(0).max(100).optional(),
    archived: z.boolean().default(false),
    initialSealed: z.number().int().nonnegative().default(0),
    initialDepSealed: z.number().int().nonnegative().default(0),
    initialOpen: z.number().nonnegative().default(0),
  })
  .refine((v) => !v.tracked || (v.pkgSize && v.pkgLabel), {
    message: "Itens rastreados precisam de embalagem e tamanho.",
  });

export type StockItemFormInput = z.input<typeof itemSchema>;

/**
 * Category and unit are ids of the store's own Configurações → Estoque lists.
 * UNIT RULE (single source of truth): the unit's kind decides the consumption
 * mode — measure (weight/volume) → contínuo, count → medido. Derived here,
 * never trusted from the client.
 */
function resolveItemConfig(settings: StockSettings, category: string, unit: string) {
  if (!settings.categories.some((c) => c.id === category)) throw new Error("Categoria inválida.");
  if (!settings.units.some((u) => u.id === unit)) throw new Error("Unidade inválida.");
  const measure = unitKind(settings.units, unit) === "measure";
  return {
    continuousUse: measure,
    consumptionMode: measure ? ("continuo" as const) : ("medido" as const),
  };
}

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Algo deu errado.",
    };
  }
}

export async function createStockItemAction(
  input: StockItemFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, initialSealed, initialDepSealed, initialOpen, ...rest } =
      itemSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    const data = {
      ...rest,
      ...resolveItemConfig(await getStockSettings(storeId), rest.category, rest.unit),
    } as const;
    await createStockItem(
      storeId,
      data,
      {
        sealed: data.tracked ? initialSealed : 0,
        depSealed: data.tracked ? initialDepSealed : 0,
        open: initialOpen,
      },
      user.email,
    );
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

export async function updateStockItemAction(
  itemId: string,
  input: StockItemFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const parsed = itemSchema.parse(input);
    const { storeId } = parsed;
    await requireAccess(storeId, "estoque");
    const data = {
      name: parsed.name,
      category: parsed.category,
      unit: parsed.unit,
      tracked: parsed.tracked,
      pkgLabel: parsed.pkgLabel,
      pkgLabelPlural: parsed.pkgLabelPlural,
      pkgSize: parsed.pkgSize,
      ...resolveItemConfig(await getStockSettings(storeId), parsed.category, parsed.unit),
      resellable: parsed.resellable,
      cost: parsed.cost,
      sellPrice: parsed.sellPrice,
      reorderAt: parsed.reorderAt,
      yieldPct: parsed.yieldPct,
      archived: parsed.archived,
    };
    await updateStockItem(storeId, itemId, data);
    revalidatePath(`/painel/${storeId}/estoque`);
  });
}

/**
 * Everything that still points at `itemId` — recipe/adicional rows and
 * revenda/adicional's insumoId (products), sabor recipe rows and base/borda/
 * adicional/utensílio's single insumo (shakes). Deleting the doc out from
 * under any of these leaves a dangling stockItemId that resolves to nothing:
 * the sale still goes through, but planConsumption's `if (!entry) continue`
 * silently skips the draw forever — no error, no low-stock flag, nothing.
 * (This is exactly how 3 real products ended up drawing zero stock in
 * production: their insumo was deleted, not merely left unlinked.)
 */
async function findStockItemReferences(storeId: string, itemId: string): Promise<string[]> {
  const [products, flavors, bases, rims, mixins, utensils] = await Promise.all([
    listProducts(storeId),
    listShakeFlavors(storeId),
    listShakeBases(storeId),
    listShakeRims(storeId),
    listShakeMixins(storeId),
    listShakeUtensils(storeId),
  ]);
  const names: string[] = [];
  for (const p of products) {
    if (
      p.insumoId === itemId ||
      p.recipe.some((r) => r.stockItemId === itemId) ||
      p.adicionais.some((a) => a.stockItemId === itemId)
    ) {
      names.push(p.name);
    }
  }
  for (const f of flavors) {
    if (f.recipe.some((r) => r.stockItemId === itemId)) names.push(f.name);
  }
  for (const b of bases) if (b.insumo.stockItemId === itemId) names.push(b.name);
  for (const r of rims) if (r.insumo.stockItemId === itemId) names.push(r.name);
  for (const m of mixins) if (m.insumo.stockItemId === itemId) names.push(m.name);
  for (const u of utensils) if (u.insumo.stockItemId === itemId) names.push(u.name);
  return names;
}

export async function deleteStockItemAction(
  storeId: string,
  itemId: string,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "estoque");
    const refs = await findStockItemReferences(storeId, itemId);
    if (refs.length > 0) {
      throw new Error(
        `Não é possível excluir: vinculado a ${refs.join(", ")}. Remova o vínculo (ou arquive o item em vez de excluir).`,
      );
    }
    await deleteStockItem(storeId, itemId);
    revalidatePath(`/painel/${storeId}/estoque`);
  });
}

export async function listMovementsAction(
  storeId: string,
  itemId: string,
  opts: { loc?: "loja" | "deposito"; kind?: MovementKind; before?: string } = {},
): Promise<MovementPage> {
  await requireAccess(storeId, "estoque");
  return listMovementsPage(storeId, itemId, { ...opts, limit: 15 });
}

export async function getStockItemAction(
  storeId: string,
  itemId: string,
): Promise<import("@/lib/types").StockItem | null> {
  await requireAccess(storeId, "estoque");
  return getStockItem(storeId, itemId);
}

/** Uses per package the catalog's recipes expect, from the amount each recipe line takes per use. */
async function expectedUsesFor(storeId: string, itemId: string, pkgSize?: number) {
  const products = await listProducts(storeId);
  const perUse: number[] = [];
  for (const p of products) {
    for (const r of p.recipe) if (r.stockItemId === itemId && r.qty) perUse.push(r.qty);
  }
  return expectedUses(pkgSize, perUse);
}

export async function openNextPackageAction(
  storeId: string,
  itemId: string,
  from: "loja" | "deposito" = "loja",
): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAccess(storeId, "estoque");
    if (!STOCK_LOCATIONS.includes(from)) throw new Error("Origem inválida.");
    const item = await getStockItem(storeId, itemId);
    const note = item
      ? lastPackageNote(item.lastUsos, await expectedUsesFor(storeId, itemId, item.pkgSize))
      : undefined;
    const name = await openNextPackage(storeId, itemId, user.email, { from, note });
    await logActivity(storeId, {
      icon: "package",
      label: `Abriu nova embalagem · ${name}`,
      detail: "Estoque",
      by: user.email,
      section: "estoque",
    });
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

export async function markPackageEmptyAction(
  storeId: string,
  itemId: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAccess(storeId, "estoque");
    const name = await markPackageEmpty(storeId, itemId, user.email);
    await logActivity(storeId, {
      icon: "package",
      label: `Finalizou embalagem · ${name}`,
      detail: "Estoque",
      by: user.email,
      section: "estoque",
    });
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

const adjustOpenSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  open: z.number().int("Informe um número inteiro de unidades.").nonnegative("Informe as unidades restantes."),
  reason: z.enum(OPEN_ADJUST_REASONS).optional(),
});

export type AdjustOpenFormInput = z.input<typeof adjustOpenSchema>;

/**
 * "Ajustar embalagem aberta" (per-unit items): overwrite the calculated open
 * balance with the real count. The unit must be a count unit — enforced by the
 * data layer through the item's persisted consumption mode.
 */
export async function adjustOpenBalanceAction(
  input: AdjustOpenFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, itemId, open, reason } = adjustOpenSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    const [item, settings] = await Promise.all([getStockItem(storeId, itemId), getStockSettings(storeId)]);
    if (!item) throw new Error("Item não encontrado.");
    const { name, from, to } = await adjustOpenBalance(storeId, itemId, {
      open,
      reason,
      unitLabel: unitLabelFrom(settings.units, item.unit),
      by: user.email,
    });
    await logActivity(storeId, {
      icon: "sliders-horizontal",
      label: `Ajuste · ${name}`,
      detail: `Embalagem aberta ${from} → ${to}`,
      by: user.email,
      section: "estoque",
    });
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

const movementSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  type: z.enum(MANUAL_MOVEMENT_TYPES),
  qty: z.number().positive("Informe a quantidade."),
  byPackage: z.boolean().default(false),
  price: z.number().int().nonnegative().optional(),
  reason: z.enum(STOCK_MOVEMENT_REASONS).optional(),
  refOrder: z.string().trim().optional(),
  refItem: z.string().trim().optional(),
  /** Where the stock goes/leaves; default Loja. The depósito holds whole packages only. */
  loc: z.enum(STOCK_LOCATIONS).default("loja"),
  /** "YYYY-MM-DD" purchase date; omitted or today = now. Back-dating replays the ledger. */
  date: z.string().optional(),
});

export type MovementFormInput = z.input<typeof movementSchema>;

export async function applyMovementAction(
  input: MovementFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, itemId, date, ...data } = movementSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    const name = await applyMovement(storeId, itemId, {
      ...data,
      at: date ? zonedDateToInstant(date) : undefined,
      by: user.email,
    });
    const isAdjust = data.reason === "AJUSTE";
    await logActivity(storeId, {
      icon: isAdjust
        ? "sliders-horizontal"
        : data.type === "entrada"
          ? "package-plus"
          : "package-minus",
      label: isAdjust
        ? `Ajuste · ${name}`
        : data.type === "entrada"
          ? `Registrou entrada · ${name}`
          : `Baixa · ${name}`,
      detail: "Estoque",
      by: user.email,
      section: "estoque",
    });
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

const updateMovementSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  movementId: z.string().min(1),
  qty: z.number().positive("Informe a quantidade."),
  byPackage: z.boolean().default(false),
  price: z.number().int().nonnegative().optional(),
}).superRefine((v, ctx) => {
  if (v.byPackage && !Number.isInteger(v.qty)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Movimentações por embalagem precisam de quantidade inteira.",
      path: ["qty"],
    });
  }
});

export type UpdateMovementFormInput = z.input<typeof updateMovementSchema>;

export async function updateMovementAction(
  input: UpdateMovementFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const parsed = updateMovementSchema.parse(input);
    const { storeId, itemId, movementId, qty, price } = parsed;
    await requireAccess(storeId, "estoque");
    await updateMovement(storeId, itemId, movementId, { qty, price });
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

const deleteMovementSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  movementId: z.string().min(1),
});

export type DeleteMovementFormInput = z.input<typeof deleteMovementSchema>;

export async function deleteMovementAction(
  input: DeleteMovementFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, itemId, movementId } = deleteMovementSchema.parse(input);
    await requireAccess(storeId, "estoque");
    await deleteMovement(storeId, itemId, movementId);
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
  });
}

const transferSchema = z.object({
  storeId: z.string().min(1),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.number().int("Informe um número inteiro de embalagens.").positive("Informe a quantidade."),
      }),
    )
    .min(1, "Escolha ao menos um item."),
  note: z.string().trim().max(200).optional(),
});

export type TransferFormInput = z.input<typeof transferSchema>;

/** "Transferir para a loja": Depósito → Loja, one TR-0001 code for every line. */
export async function transferToStoreAction(
  input: TransferFormInput,
): Promise<ActionResult & { trCode?: string }> {
  try {
    const { storeId, lines, note } = transferSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    const { trCode, count } = await transferToStore(storeId, lines, user.email, note);
    await logActivity(storeId, {
      icon: "package-plus",
      label: `Transferência ${trCode} · ${count} ${count === 1 ? "item" : "itens"}`,
      detail: "Depósito → Loja",
      by: user.email,
      section: "estoque",
    });
    revalidatePath(`/painel/${storeId}/estoque`);
    revalidatePath(`/painel/${storeId}`);
    return { ok: true, trCode };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}
