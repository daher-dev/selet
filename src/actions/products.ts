"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/data/products";
import { logActivity } from "@/data/activity";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_TYPE_TAGS,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Every insumo/opcional the catalog offers must trace to a real Estoque item —
// no more "topping, no stock link" exceptions (see scripts/lib/recipes.ts's
// Calda Quente / Pão de Mel for what that policy silently cost: sales of those
// items never drew stock, with no error or warning anywhere). stockItemId is
// therefore required here, not optional — the type in @/lib/types stays
// optional because it also describes reading old docs that predate this rule.
const recipeItemSchema = z.object({
  stockItemId: z.string().min(1, "Vincule este insumo a um item do estoque."),
  name: z.string().trim().min(1),
  qty: z.number().nonnegative().nullable(),
  unit: z.string().trim().default(""),
});

const tierSchema = z.object({
  qty: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

const addonSchema = z.object({
  stockItemId: z.string().min(1, "Vincule este opcional a um item do estoque."),
  name: z.string().trim().min(1),
  price: z.number().int().nonnegative(),
  qty: z.number().nonnegative().nullable().optional(),
  unit: z.string().trim().optional(),
  tiers: z.array(tierSchema).optional(),
});

const saleOfferSchema = z.object({
  recipe: z.array(recipeItemSchema).min(1, "Adicione ao menos um insumo à base."),
  adicionais: z.array(addonSchema).default([]),
  tiers: z.array(tierSchema).min(1, "Informe ao menos uma faixa de preço."),
  // Seller commission by the dose — independent of the resale commission.
  commissionPercent: z.number().min(0).max(100, "A comissão deve ser de no máximo 100%.").optional(),
});

const resaleOfferSchema = z.object({
  insumoId: z.string().min(1, "Selecione o item do estoque."),
  tiers: z.array(tierSchema).min(1, "Informe ao menos uma faixa de preço."),
  // Seller commission, % of the amount sold by the package. Omitted/0 = off.
  commissionPercent: z.number().min(0).max(100, "A comissão deve ser de no máximo 100%.").optional(),
});

// A product offers a prepared SALE (open-package portions, no commission), a
// RESALE (whole sealed packages, earns commission), or both — each optional.
const productShape = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do produto."),
  category: z.enum(PRODUCT_CATEGORIES),
  typeTags: z.array(z.enum(PRODUCT_TYPE_TAGS)).default([]),
  description: z.string().trim().max(280).optional(),
  active: z.boolean().default(true),
  sale: saleOfferSchema.optional(),
  resale: resaleOfferSchema.optional(),
  /** A resale-only item also offered as an add-on inside other products. */
  adicional: z.boolean().default(false),
});

const productSchema = productShape.superRefine((data, ctx) => {
  if (!data.sale && !data.resale) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ofereça o item por dose (menu) ou por embalagem (revenda).",
      path: ["sale"],
    });
  }
  if (data.adicional && (data.sale || !data.resale)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Um adicional é só revenda, sem preparo.",
      path: ["adicional"],
    });
  }
  if (data.adicional && data.resale?.commissionPercent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Adicionais não têm comissão própria.",
      path: ["resale", "commissionPercent"],
    });
  }
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
    revalidatePath(`/painel/${storeId}/produtos`);
  });
}

export async function updateProductAction(
  productId: string,
  input: ProductFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = productSchema.parse(input);
    const user = await requireAccess(storeId, "produtos");
    await updateProduct(storeId, productId, data);
    await logActivity(storeId, {
      icon: "tag",
      label: `Editou · ${data.name}`,
      detail: "Catálogo",
      by: user.email,
      section: "produtos",
    });
    revalidatePath(`/painel/${storeId}/produtos`);
  });
}

export async function deleteProductAction(
  storeId: string,
  productId: string,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "produtos");
    await deleteProduct(storeId, productId);
    revalidatePath(`/painel/${storeId}/produtos`);
  });
}
