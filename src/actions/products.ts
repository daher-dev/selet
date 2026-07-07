"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/data/products";
import { PRODUCT_CATEGORIES, PRODUCT_TYPE_TAGS } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const productSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do produto."),
  price: z.number().int().positive("Preço deve ser maior que zero."),
  category: z.enum(PRODUCT_CATEGORIES),
  typeTags: z.array(z.enum(PRODUCT_TYPE_TAGS)).default([]),
  description: z.string().trim().max(280).optional(),
  active: z.boolean().default(true),
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
