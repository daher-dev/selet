"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { createManualTx, deleteManualTx, getTxCategory, updateManualTx } from "@/data/finance";
import { getFinanceSettings } from "@/data/settings";
import type { ActionResult } from "./products";

const manualTxSchema = z.object({
  storeId: z.string().min(1),
  label: z.string().trim().min(1, "Descreva o lançamento."),
  category: z.string().min(1, "Escolha a categoria."),
  amount: z.number().int().positive("Valor deve ser maior que zero."),
  direction: z.enum(["in", "out"]),
  date: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(500).optional(),
});

export type ManualTxFormInput = z.input<typeof manualTxSchema>;

/** Category must be one of the store's own, for the lançamento's direction. */
async function assertCategory(
  storeId: string,
  category: string,
  direction: "in" | "out",
  unchangedFrom?: string,
) {
  if (unchangedFrom !== undefined && category === unchangedFrom) return; // legacy key left as is
  const { categories } = await getFinanceSettings(storeId);
  if (!categories.some((c) => c.id === category && c.direction === direction)) {
    throw new Error("Categoria inválida.");
  }
}

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
    const user = await requireAccess(storeId, "financeiro");
    await assertCategory(storeId, data.category, data.direction);
    await createManualTx(storeId, data, user.name);
    revalidatePath(`/s/${storeId}/financeiro`);
    revalidatePath(`/s/${storeId}/financeiro/movimentacoes`);
    revalidatePath(`/s/${storeId}`);
  });
}

export async function updateManualTxAction(
  txId: string,
  input: ManualTxFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = manualTxSchema.parse(input);
    await requireAccess(storeId, "financeiro");
    await assertCategory(storeId, data.category, data.direction, await getTxCategory(storeId, txId));
    await updateManualTx(storeId, txId, data);
    revalidatePath(`/s/${storeId}/financeiro`);
    revalidatePath(`/s/${storeId}/financeiro/movimentacoes`);
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
    revalidatePath(`/s/${storeId}/financeiro/movimentacoes`);
    revalidatePath(`/s/${storeId}`);
  });
}
