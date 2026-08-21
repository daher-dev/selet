"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  addPudimBrindes,
  createPudimBase,
  createPudimFlavor,
  createPudimMixin,
  createPudimUtensil,
  setPudimBrindeArchived,
  updatePudimBase,
  updatePudimFlavor,
  updatePudimMixin,
  updatePudimUtensil,
} from "@/data/pudim";
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
  revalidatePath(`/s/${storeId}/pudim`);
}

// Every sabor insumo must trace to a real Estoque item — same rule as
// actions/products.ts's productSchema, and for the same reason: a sabor
// saved with an empty/unlinked recipe sells normally but silently draws zero
// stock forever (resolvePudimLine in data/consumption.ts just loops over
// nothing). stockItemId is required here, not optional — the type in
// @/lib/types stays optional because it also describes reading old docs that
// predate this rule.
const recipeItemSchema = z.object({
  stockItemId: z.string().min(1, "Vincule este insumo a um item do estoque."),
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

const flavorSchema = z
  .object({
    storeId: z.string().min(1),
    name: z.string().trim().min(1, "Informe o nome do sabor."),
    // Zero is intentional, not an oversight: staff sometimes don't charge
    // extra for a flavor but must still debit its recipe from stock (price
    // never gates a stock draw — see data/consumption.ts's resolvePudimLine
    // and its brinde comment for the established precedent).
    price: z.number().int().nonnegative("Preço não pode ser negativo."),
    recipe: z.array(recipeItemSchema).default([]),
    archived: z.boolean().default(false),
  })
  .refine((data) => data.recipe.length > 0, {
    message: "Adicione ao menos um insumo a este sabor.",
    path: ["recipe"],
  });

export type PudimFlavorFormInput = z.input<typeof flavorSchema>;

export async function createPudimFlavorAction(
  input: PudimFlavorFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = flavorSchema.parse(input);
    await requireAccess(storeId, "pudim");
    await createPudimFlavor(storeId, data);
    revalidate(storeId);
  });
}

export async function updatePudimFlavorAction(
  id: string,
  input: PudimFlavorFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = flavorSchema.parse(input);
    const user = await requireAccess(storeId, "pudim");
    await updatePudimFlavor(storeId, id, data);
    await logActivity(storeId, {
      icon: "dessert",
      label: `Editou sabor · ${data.name}`,
      detail: "Pudim",
      by: user.email,
      section: "pudim",
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

export type PudimBaseFormInput = z.input<typeof baseSchema>;

export async function createPudimBaseAction(
  input: PudimBaseFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = baseSchema.parse(input);
    await requireAccess(storeId, "pudim");
    await createPudimBase(storeId, data);
    revalidate(storeId);
  });
}

export async function updatePudimBaseAction(
  id: string,
  input: PudimBaseFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = baseSchema.parse(input);
    const user = await requireAccess(storeId, "pudim");
    await updatePudimBase(storeId, id, data);
    await logActivity(storeId, {
      icon: "dessert",
      label: `Editou base · ${data.name}`,
      detail: "Pudim",
      by: user.email,
      section: "pudim",
    });
    revalidate(storeId);
  });
}

// ---------------------------------------------------------------------------
// Adicionais — tiered pricing (the only tiered modifier type Pudim has).
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

export async function createPudimMixinAction(
  input: TieredModifierFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = tieredModifierSchema.parse(input);
    await requireAccess(storeId, "pudim");
    await createPudimMixin(storeId, data);
    revalidate(storeId);
  });
}

export async function updatePudimMixinAction(
  id: string,
  input: TieredModifierFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = tieredModifierSchema.parse(input);
    const user = await requireAccess(storeId, "pudim");
    await updatePudimMixin(storeId, id, data);
    await logActivity(storeId, {
      icon: "dessert",
      label: `Editou adicional · ${data.name}`,
      detail: "Pudim",
      by: user.email,
      section: "pudim",
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

export type PudimUtensilFormInput = z.input<typeof utensilSchema>;

export async function createPudimUtensilAction(
  input: PudimUtensilFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = utensilSchema.parse(input);
    await requireAccess(storeId, "pudim");
    await createPudimUtensil(storeId, data);
    revalidate(storeId);
  });
}

export async function updatePudimUtensilAction(
  id: string,
  input: PudimUtensilFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = utensilSchema.parse(input);
    const user = await requireAccess(storeId, "pudim");
    await updatePudimUtensil(storeId, id, data);
    await logActivity(storeId, {
      icon: "dessert",
      label: `Editou utensílio · ${data.name}`,
      detail: "Pudim",
      by: user.email,
      section: "pudim",
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

export type AddPudimBrindesInput = z.input<typeof addBrindesSchema>;

export async function addPudimBrindesAction(
  input: AddPudimBrindesInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, productIds } = addBrindesSchema.parse(input);
    const user = await requireAccess(storeId, "pudim");
    const count = await addPudimBrindes(storeId, productIds);
    await logActivity(storeId, {
      icon: "dessert",
      label: `Adicionou ${count} brinde${count === 1 ? "" : "s"}`,
      detail: "Pudim",
      by: user.email,
      section: "pudim",
    });
    revalidate(storeId);
  });
}

const setBrindeArchivedSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  archived: z.boolean(),
});

export type SetPudimBrindeArchivedInput = z.input<typeof setBrindeArchivedSchema>;

export async function setPudimBrindeArchivedAction(
  input: SetPudimBrindeArchivedInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, productId, archived } = setBrindeArchivedSchema.parse(input);
    const user = await requireAccess(storeId, "pudim");
    await setPudimBrindeArchived(storeId, productId, archived);
    await logActivity(storeId, {
      icon: "dessert",
      label: `${archived ? "Arquivou" : "Restaurou"} brinde`,
      detail: "Pudim",
      by: user.email,
      section: "pudim",
    });
    revalidate(storeId);
  });
}
