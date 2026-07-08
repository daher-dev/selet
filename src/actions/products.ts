"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  createProduct,
  deleteProduct,
  produceBatch,
  updateProduct,
} from "@/data/products";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_SALE_TYPES,
  PRODUCT_TYPE_TAGS,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const recipeItemSchema = z.object({
  stockItemId: z.string().optional(),
  name: z.string().trim().min(1),
  qty: z.number().nonnegative().nullable(),
  unit: z.string().trim().default(""),
});

const addonSchema = z.object({
  stockItemId: z.string().optional(),
  name: z.string().trim().min(1),
  price: z.number().int().nonnegative(),
  qty: z.number().nonnegative().nullable().optional(),
  unit: z.string().trim().optional(),
});

const tierSchema = z.object({
  qty: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

const productSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do produto."),
  price: z.number().int().positive("Preço deve ser maior que zero."),
  category: z.enum(PRODUCT_CATEGORIES),
  typeTags: z.array(z.enum(PRODUCT_TYPE_TAGS)).default([]),
  description: z.string().trim().max(280).optional(),
  active: z.boolean().default(true),
  saleType: z.enum(PRODUCT_SALE_TYPES).default("menu"),
  recipe: z.array(recipeItemSchema).default([]),
  adicionais: z.array(addonSchema).default([]),
  tiers: z.array(tierSchema).min(1).default([{ qty: 1, price: 0 }]),
  insumoId: z.string().optional(),
  stockManaged: z.boolean().default(false),
  prep: z.enum(["sob demanda", "lote"]).nullish(),
  duration: z.number().int().positive().optional(),
});

export type ProductFormInput = z.input<typeof productSchema>;

/** Wraps an action body with uniform error handling for the UI. */
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

export async function createProductAction(
  input: ProductFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = productSchema.parse(input);
    await requireAccess(storeId, "produtos");
    await createProduct(storeId, data);
    revalidatePath(`/s/${storeId}/produtos`);
  });
}

export async function updateProductAction(
  productId: string,
  input: ProductFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = productSchema.parse(input);
    await requireAccess(storeId, "produtos");
    await updateProduct(storeId, productId, data);
    revalidatePath(`/s/${storeId}/produtos`);
  });
}

export async function deleteProductAction(
  storeId: string,
  productId: string,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "produtos");
    await deleteProduct(storeId, productId);
    revalidatePath(`/s/${storeId}/produtos`);
  });
}

const produceSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  porcoes: z.number().int().positive("Informe uma quantidade válida."),
});

export interface ProduceActionResult extends ActionResult {
  producedStock?: number;
  shortages?: { itemId: string; missing: number }[];
}

/**
 * Produces a batch of a stockManaged menu item: consumes its recipe insumos and
 * bumps producedStock. Gated on "estoque" — producing is a stock operation.
 */
export async function produceBatchAction(
  input: z.input<typeof produceSchema>,
): Promise<ProduceActionResult> {
  try {
    const { storeId, productId, porcoes } = produceSchema.parse(input);
    const user = await requireAccess(storeId, "estoque");
    const result = await produceBatch(storeId, productId, porcoes, user.email);
    revalidatePath(`/s/${storeId}/estoque`);
    revalidatePath(`/s/${storeId}/produtos`);
    revalidatePath(`/s/${storeId}`);
    return { ok: true, producedStock: result.producedStock, shortages: result.shortages };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}
