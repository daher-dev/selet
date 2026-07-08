"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  applyMovement,
  createStockItem,
  deleteStockItem,
  markPackageEmpty,
  openNextPackage,
  updateStockItem,
} from "@/data/stock";
import { logActivity } from "@/data/activity";
import {
  CONSUMPTION_MODES,
  consumptionModeForUnit,
  isWeightVolumeUnit,
  STOCK_CATEGORIES,
  STOCK_MOVEMENT_REASONS,
  STOCK_MOVEMENT_TYPES,
  STOCK_UNITS,
} from "@/lib/types";
import type { ActionResult } from "./products";

const itemSchema = z
  .object({
    storeId: z.string().min(1),
    name: z.string().trim().min(1, "Informe o nome do item."),
    category: z.enum(STOCK_CATEGORIES),
    unit: z.enum(STOCK_UNITS),
    tracked: z.boolean(),
    pkgLabel: z.string().trim().optional(),
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
    initialOpen: z.number().nonnegative().default(0),
  })
  .refine((v) => !v.tracked || (v.pkgSize && v.pkgLabel), {
    message: "Itens rastreados precisam de embalagem e tamanho.",
  });

export type StockItemFormInput = z.input<typeof itemSchema>;

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
    const { storeId, initialSealed, initialOpen, ...rest } =
      itemSchema.parse(input);
    // UNIT RULE (single source of truth): weight/volume → contínuo (manual);
    // countable → medido. Derived from the unit, never trusted from the client.
    const data = {
      ...rest,
      continuousUse: isWeightVolumeUnit(rest.unit),
      consumptionMode: consumptionModeForUnit(rest.unit),
    } as const;
    const user = await requireAccess(storeId, "estoque");
    await createStockItem(
      storeId,
      data,
      { sealed: data.tracked ? initialSealed : 0, open: initialOpen },
      user.email,
    );
    revalidatePath(`/s/${storeId}/estoque`);
    revalidatePath(`/s/${storeId}`);
  });
}

export async function updateStockItemAction(
  itemId: string,
  input: StockItemFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const parsed = itemSchema.parse(input);
    const { storeId } = parsed;
    const data = {
      name: parsed.name,
      category: parsed.category,
      unit: parsed.unit,
      tracked: parsed.tracked,
      pkgLabel: parsed.pkgLabel,
      pkgSize: parsed.pkgSize,
      // UNIT RULE: derived from unit, never trusted from the client.
      continuousUse: isWeightVolumeUnit(parsed.unit),
      consumptionMode: consumptionModeForUnit(parsed.unit),
      resellable: parsed.resellable,
      cost: parsed.cost,
      sellPrice: parsed.sellPrice,
      reorderAt: parsed.reorderAt,
      yieldPct: parsed.yieldPct,
      archived: parsed.archived,
    };
    await requireAccess(storeId, "estoque");
    await updateStockItem(storeId, itemId, data);
    revalidatePath(`/s/${storeId}/estoque`);
  });
}

export async function deleteStockItemAction(
  storeId: string,
  itemId: string,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "estoque");
    await deleteStockItem(storeId, itemId);
    revalidatePath(`/s/${storeId}/estoque`);
  });
}

export async function listMovementsAction(
  storeId: string,
  itemId: string,
): Promise<import("@/lib/types").StockMovement[]> {
  await requireAccess(storeId, "estoque");
  const { listMovements } = await import("@/data/stock");
  return listMovements(storeId, itemId, 15);
}

export async function openNextPackageAction(
  storeId: string,
  itemId: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAccess(storeId, "estoque");
    const name = await openNextPackage(storeId, itemId, user.email);
    await logActivity(storeId, {
      icon: "package",
      label: `Abriu nova embalagem · ${name}`,
      detail: "Estoque",
      by: user.email,
      section: "estoque",
    });
    revalidatePath(`/s/${storeId}/estoque`);
    revalidatePath(`/s/${storeId}`);
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
    revalidatePath(`/s/${storeId}/estoque`);
    revalidatePath(`/s/${storeId}`);
  });
}

const movementSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  qty: z.number().positive("Informe a quantidade."),
  byPackage: z.boolean().default(false),
  price: z.number().int().nonnegative().optional(),
  reason: z.enum(STOCK_MOVEMENT_REASONS).optional(),
  refOrder: z.string().trim().optional(),
  refItem: z.string().trim().optional(),
});

export type MovementFormInput = z.input<typeof movementSchema>;

export async function applyMovementAction(
  input: MovementFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, itemId, ...data } = movementSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    const name = await applyMovement(storeId, itemId, { ...data, by: user.email });
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
    revalidatePath(`/s/${storeId}/estoque`);
    revalidatePath(`/s/${storeId}`);
  });
}
