"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  applyMovement,
  createStockItem,
  deleteStockItem,
  updateStockItem,
} from "@/data/stock";
import {
  STOCK_CATEGORIES,
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
    resellable: z.boolean().default(false),
    cost: z.number().int().nonnegative().optional(),
    sellPrice: z.number().int().nonnegative().optional(),
    reorderAt: z.number().nonnegative().default(0),
    yieldPct: z.number().min(0).max(100).optional(),
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
    const { storeId, initialSealed, initialOpen, ...data } =
      itemSchema.parse(input);
    await requireAccess(storeId, "estoque");
    await createStockItem(storeId, data, {
      sealed: data.tracked ? initialSealed : 0,
      open: initialOpen,
    });
    revalidatePath(`/s/${storeId}/estoque`);
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
      continuousUse: parsed.continuousUse,
      resellable: parsed.resellable,
      cost: parsed.cost,
      sellPrice: parsed.sellPrice,
      reorderAt: parsed.reorderAt,
      yieldPct: parsed.yieldPct,
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

const movementSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  qty: z.number().positive("Informe a quantidade."),
  byPackage: z.boolean().default(false),
  price: z.number().int().nonnegative().optional(),
  reason: z.string().trim().optional(),
});

export type MovementFormInput = z.input<typeof movementSchema>;

export async function applyMovementAction(
  input: MovementFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, itemId, ...data } = movementSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    await applyMovement(storeId, itemId, { ...data, by: user.email });
    revalidatePath(`/s/${storeId}/estoque`);
    revalidatePath(`/s/${storeId}`);
  });
}
