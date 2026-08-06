"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { cancelCartela, listCartelasByCustomer } from "@/data/cartelas";
import { logActivity } from "@/data/activity";
import { cartelaCode } from "@/lib/cartelas";
import type { Cartela } from "@/lib/types";
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
  revalidatePath(`/s/${storeId}/cartelas`);
  revalidatePath(`/s/${storeId}/clientes`);
  revalidatePath(`/s/${storeId}`);
}

const cancelSchema = z.object({
  storeId: z.string().min(1),
  cartelaId: z.string().min(1),
});

export async function cancelCartelaAction(
  input: z.input<typeof cancelSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, cartelaId } = cancelSchema.parse(input);
    const user = await requireAccess(storeId, "cartelas");
    await cancelCartela(storeId, cartelaId);
    await logActivity(storeId, {
      icon: "ban",
      label: `Cancelou cartela #${cartelaCode(cartelaId)}`,
      detail: "Cartelas",
      by: user.email,
      section: "cartelas",
    });
    revalidate(storeId);
  });
}

/**
 * Read-only lookup for the Pedidos order drawer's cartela offer strip — skips
 * the ActionResult wrapper like listMemberActivityAction, since it's a lazy
 * client-side fetch, not a form submit. Gated on "pedidos" (not "cartelas"):
 * applying a cartela at the counter is a Pedidos concern, separate from the
 * admin-only Cartelas management screen — same reasoning pedidos/page.tsx
 * already documents for shake catalogs. Returns [] (rather than throwing)
 * when the caller lacks access, so the strip just stays hidden instead of
 * erroring the whole order drawer.
 */
export async function listCartelasByCustomerAction(
  storeId: string,
  customerId: string,
): Promise<Cartela[]> {
  try {
    await requireAccess(storeId, "pedidos");
  } catch {
    return [];
  }
  return listCartelasByCustomer(storeId, customerId);
}
