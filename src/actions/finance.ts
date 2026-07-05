"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { createManualTx, deleteManualTx } from "@/data/finance";
import { FINANCE_CATEGORIES } from "@/lib/types";
import type { ActionResult } from "./products";

const manualTxSchema = z.object({
  storeId: z.string().min(1),
  label: z.string().trim().min(1, "Descreva o lançamento."),
  category: z.enum(FINANCE_CATEGORIES),
  amount: z.number().int().positive("Valor deve ser maior que zero."),
  direction: z.enum(["in", "out"]),
  date: z.iso.datetime({ offset: true }),
});

export type ManualTxFormInput = z.input<typeof manualTxSchema>;

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

export async function createManualTxAction(
  input: ManualTxFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = manualTxSchema.parse(input);
    await requireAccess(storeId, "financeiro");
    await createManualTx(storeId, data);
    revalidatePath(`/s/${storeId}/financeiro`);
    revalidatePath(`/s/${storeId}`);
  });
}

export async function deleteManualTxAction(
  storeId: string,
  txId: string,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "financeiro");
    await deleteManualTx(storeId, txId);
    revalidatePath(`/s/${storeId}/financeiro`);
    revalidatePath(`/s/${storeId}`);
  });
}
