"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  createCustomer,
  setCustomerArchived,
  updateCustomer,
} from "@/data/customers";
import type { ActionResult } from "./products";

const customerSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do cliente."),
  phone: z.string().trim().optional(),
  city: z.string().trim().optional(),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .optional(),
  birthday: z
    .object({
      day: z.number().int().min(1).max(31),
      month: z.number().int().min(1).max(12),
    })
    .optional(),
  since: z.iso.datetime({ offset: true }).optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().trim().optional(),
  archived: z.boolean().optional(),
});

export type CustomerFormInput = z.input<typeof customerSchema>;

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

export async function createCustomerAction(
  input: CustomerFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = customerSchema.parse(input);
    await requireAccess(storeId, "clientes");
    await createCustomer(storeId, data);
    revalidatePath(`/s/${storeId}/clientes`);
  });
}

export async function updateCustomerAction(
  customerId: string,
  input: CustomerFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = customerSchema.parse(input);
    await requireAccess(storeId, "clientes");
    await updateCustomer(storeId, customerId, data);
    revalidatePath(`/s/${storeId}/clientes`);
  });
}

export async function setCustomerArchivedAction(
  storeId: string,
  customerId: string,
  archived: boolean,
): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "clientes");
    await setCustomerArchived(storeId, customerId, archived);
    revalidatePath(`/s/${storeId}/clientes`);
  });
}
