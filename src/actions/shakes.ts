"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  addShakeBrindes,
  createShakeBase,
  createShakeFlavor,
  createShakeMixin,
  createShakeRim,
  createShakeUtensil,
  setShakeBrindeArchived,
  updateShakeBase,
  updateShakeFlavor,
  updateShakeMixin,
  updateShakeRim,
  updateShakeUtensil,
} from "@/data/shakes";
import { logActivity } from "@/data/activity";
import type { ActionResult } from "./products";

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

function revalidate(storeId: string) {
  revalidatePath(`/s/${storeId}/shakes`);
}

const recipeItemSchema = z.object({
  stockItemId: z.string().optional(),
  name: z.string().trim().min(1),
  qty: z.number().nonnegative().nullable(),
  unit: z.string().trim().optional(),
});

const insumoInputSchema = z.object({
  stockItemId: z.string().min(1, "Selecione um insumo do estoque."),
  qty: z.number().nonnegative().nullable(),
});

const tierSchema = z.object({
  qty: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Sabores
// ---------------------------------------------------------------------------

const flavorSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do sabor."),
  price: z.number().int().positive("Preço deve ser maior que zero."),
  recipe: z.array(recipeItemSchema).default([]),
  archived: z.boolean().default(false),
});

export type ShakeFlavorFormInput = z.input<typeof flavorSchema>;

export async function createShakeFlavorAction(
  input: ShakeFlavorFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = flavorSchema.parse(input);
    await requireAccess(storeId, "shakes");
    await createShakeFlavor(storeId, data);
    revalidate(storeId);
  });
}

export async function updateShakeFlavorAction(
  id: string,
  input: ShakeFlavorFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = flavorSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    await updateShakeFlavor(storeId, id, data);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `Editou sabor · ${data.name}`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}

// ---------------------------------------------------------------------------
// Bases
// ---------------------------------------------------------------------------

const baseSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome da base."),
  insumo: insumoInputSchema,
  price: z.number().int().nonnegative().default(0),
  archived: z.boolean().default(false),
});

export type ShakeBaseFormInput = z.input<typeof baseSchema>;

export async function createShakeBaseAction(
  input: ShakeBaseFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = baseSchema.parse(input);
    await requireAccess(storeId, "shakes");
    await createShakeBase(storeId, data);
    revalidate(storeId);
  });
}

export async function updateShakeBaseAction(
  id: string,
  input: ShakeBaseFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = baseSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    await updateShakeBase(storeId, id, data);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `Editou base · ${data.name}`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}

// ---------------------------------------------------------------------------
// Bordas / Adicionais — identical shape (tiered pricing).
// ---------------------------------------------------------------------------

const tieredModifierSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome."),
  insumo: insumoInputSchema,
  tiers: z
    .array(tierSchema)
    .min(1, "Adicione ao menos uma faixa de preço.")
    .refine((tiers) => tiers.some((t) => t.qty === 1), {
      message: "Inclua a faixa de quantidade 1 (preço unitário).",
    }),
  archived: z.boolean().default(false),
});

export type TieredModifierFormInput = z.input<typeof tieredModifierSchema>;

export async function createShakeRimAction(
  input: TieredModifierFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = tieredModifierSchema.parse(input);
    await requireAccess(storeId, "shakes");
    await createShakeRim(storeId, data);
    revalidate(storeId);
  });
}

export async function updateShakeRimAction(
  id: string,
  input: TieredModifierFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = tieredModifierSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    await updateShakeRim(storeId, id, data);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `Editou borda · ${data.name}`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}

export async function createShakeMixinAction(
  input: TieredModifierFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = tieredModifierSchema.parse(input);
    await requireAccess(storeId, "shakes");
    await createShakeMixin(storeId, data);
    revalidate(storeId);
  });
}

export async function updateShakeMixinAction(
  id: string,
  input: TieredModifierFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = tieredModifierSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    await updateShakeMixin(storeId, id, data);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `Editou adicional · ${data.name}`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}

// ---------------------------------------------------------------------------
// Utensílios
// ---------------------------------------------------------------------------

const utensilSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do utensílio."),
  insumo: insumoInputSchema,
  defaultIncluded: z.boolean().default(true),
  archived: z.boolean().default(false),
});

export type ShakeUtensilFormInput = z.input<typeof utensilSchema>;

export async function createShakeUtensilAction(
  input: ShakeUtensilFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = utensilSchema.parse(input);
    await requireAccess(storeId, "shakes");
    await createShakeUtensil(storeId, data);
    revalidate(storeId);
  });
}

export async function updateShakeUtensilAction(
  id: string,
  input: ShakeUtensilFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = utensilSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    await updateShakeUtensil(storeId, id, data);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `Editou utensílio · ${data.name}`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}

// ---------------------------------------------------------------------------
// Brindes
// ---------------------------------------------------------------------------

const addBrindesSchema = z.object({
  storeId: z.string().min(1),
  productIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um produto."),
});

export type AddShakeBrindesInput = z.input<typeof addBrindesSchema>;

export async function addShakeBrindesAction(
  input: AddShakeBrindesInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, productIds } = addBrindesSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    const count = await addShakeBrindes(storeId, productIds);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `Adicionou ${count} brinde${count === 1 ? "" : "s"}`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}

const setBrindeArchivedSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  archived: z.boolean(),
});

export type SetShakeBrindeArchivedInput = z.input<typeof setBrindeArchivedSchema>;

export async function setShakeBrindeArchivedAction(
  input: SetShakeBrindeArchivedInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, productId, archived } = setBrindeArchivedSchema.parse(input);
    const user = await requireAccess(storeId, "shakes");
    await setShakeBrindeArchived(storeId, productId, archived);
    await logActivity(storeId, {
      icon: "cup-soda",
      label: `${archived ? "Arquivou" : "Restaurou"} brinde`,
      detail: "Shakes",
      by: user.email,
      section: "shakes",
    });
    revalidate(storeId);
  });
}
