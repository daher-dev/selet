"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  listCommissionItems,
  registerCommissionPayment,
  undoCommissionPayment,
} from "@/data/commissions";
import { logActivity } from "@/data/activity";
import { PAY_METHODS, type CommissionItemRow } from "@/lib/types";
import type { ActionResult } from "./products";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.");

const paySchema = z.object({
  storeId: z.string().min(1),
  month: monthSchema,
  sellerEmail: z.string().min(1),
  payMethod: z.enum(PAY_METHODS),
});

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}

function revalidate(storeId: string) {
  revalidatePath(`/painel/${storeId}/financeiro`);
  revalidatePath(`/painel/${storeId}/financeiro/movimentacoes`);
}

/** Pays the seller's outstanding commission for the month (amount is computed server-side). */
export async function registerCommissionPaymentAction(
  input: z.input<typeof paySchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, month, sellerEmail, payMethod } = paySchema.parse(input);
    const user = await requireAccess(storeId, "financeiro");
    await registerCommissionPayment(storeId, { month, sellerEmail, payMethod }, user.email);
    await logActivity(storeId, {
      icon: "wallet",
      label: `Pagou comissão · ${sellerEmail}`,
      detail: `Financeiro · ${month}`,
      by: user.email,
      section: "financeiro",
    });
    revalidate(storeId);
  });
}

export async function undoCommissionPaymentAction(
  storeId: string,
  paymentId: string,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "financeiro");
    await undoCommissionPayment(storeId, paymentId);
    revalidate(storeId);
  });
}

/** "Ver por item": the month's commissioned lines of one seller. */
export async function listCommissionItemsAction(
  storeId: string,
  month: string,
  sellerEmail?: string,
): Promise<{ ok: true; rows: CommissionItemRow[] } | { ok: false; error: string }> {
  try {
    monthSchema.parse(month);
    await requireAccess(storeId, "financeiro");
    return { ok: true, rows: await listCommissionItems(storeId, month, sellerEmail) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}
