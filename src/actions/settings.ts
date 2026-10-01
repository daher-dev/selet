"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { logActivity } from "@/data/activity";
import { updateStoreProfile } from "@/data/stores";
import {
  createFinanceCategory,
  createStockCategory,
  createStockUnit,
  deleteFinanceCategory,
  deleteStockCategory,
  deleteStockUnit,
  updateFinanceCategory,
  updateStockCategory,
  updateStockUnit,
} from "@/data/settings";
import { CATEGORY_ICON_KEYS, PALETTE_KEYS } from "@/lib/stock-settings";
import type { ActionResult } from "./products";

export interface SettingsResult extends ActionResult {
  /** id of the record that was created (so callers can select it). */
  id?: string;
}

async function run(fn: () => Promise<string | void>): Promise<SettingsResult> {
  try {
    const id = await fn();
    return id ? { ok: true, id } : { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}

/** Settings feed every store page (nav, estoque, financeiro…), so refresh the whole store layout. */
function refresh() {
  revalidatePath("/s/[storeId]", "layout");
}

async function audit(storeId: string, by: string, label: string, icon: string) {
  await logActivity(storeId, { icon, label, detail: "Configurações", by, section: "configuracoes" });
}

const storeId = z.string().min(1);
const color = z.enum(PALETTE_KEYS);
const name = z.string().trim().min(1, "Informe o nome.").max(40, "Nome muito longo.");

// ---------------------------------------------------------------- Loja

const profileSchema = z.object({
  storeId,
  name: z.string().trim().min(1, "Informe o nome da loja.").max(60),
  address: z.string().trim().max(160).optional(),
  whatsapp: z.string().trim().max(24).optional(),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.")
    .optional(),
});

export async function updateStoreProfileAction(input: z.input<typeof profileSchema>): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, ...data } = profileSchema.parse(input);
    const user = await requireAccess(sid, "configuracoes");
    await updateStoreProfile(sid, data);
    await audit(sid, user.email, "Atualizou os dados da loja", "store");
    refresh();
  });
}

// ---------------------------------------------------------------- Estoque: categorias

const stockCategorySchema = z.object({
  storeId,
  name,
  icon: z.enum(CATEGORY_ICON_KEYS),
  color,
});

export async function createStockCategoryAction(input: z.input<typeof stockCategorySchema>): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, ...data } = stockCategorySchema.parse(input);
    const user = await requireAccess(sid, "configuracoes");
    const id = await createStockCategory(sid, data);
    await audit(sid, user.email, `Criou a categoria de estoque ${data.name}`, "tag");
    refresh();
    return id;
  });
}

export async function updateStockCategoryAction(
  id: string,
  input: z.input<typeof stockCategorySchema>,
): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, ...data } = stockCategorySchema.parse(input);
    const user = await requireAccess(sid, "configuracoes");
    await updateStockCategory(sid, id, data);
    await audit(sid, user.email, `Editou a categoria de estoque ${data.name}`, "tag");
    refresh();
  });
}

export async function deleteStockCategoryAction(sid: string, id: string, moveToId?: string): Promise<SettingsResult> {
  return run(async () => {
    const user = await requireAccess(storeId.parse(sid), "configuracoes");
    await deleteStockCategory(sid, id, moveToId);
    await audit(sid, user.email, `Excluiu a categoria de estoque ${id}`, "trash-2");
    refresh();
  });
}

// ---------------------------------------------------------------- Estoque: unidades

const unitSchema = z.object({
  storeId,
  symbol: z.string().trim().min(1, "Informe a sigla.").max(8, "Sigla muito longa."),
  name: z.string().trim().min(1, "Informe o nome.").max(30),
  plural: z.string().trim().min(1, "Informe o plural.").max(30),
  kind: z.enum(["count", "measure"]),
});

export async function createStockUnitAction(input: z.input<typeof unitSchema>): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, ...data } = unitSchema.parse(input);
    const user = await requireAccess(sid, "configuracoes");
    const id = await createStockUnit(sid, data);
    await audit(sid, user.email, `Criou a unidade de uso ${data.symbol}`, "ruler");
    refresh();
    return id;
  });
}

export async function updateStockUnitAction(id: string, input: z.input<typeof unitSchema>): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, symbol, name, plural } = unitSchema.parse(input);
    const user = await requireAccess(sid, "configuracoes");
    await updateStockUnit(sid, id, { symbol, name, plural });
    await audit(sid, user.email, `Editou a unidade de uso ${symbol}`, "ruler");
    refresh();
  });
}

export async function deleteStockUnitAction(sid: string, id: string): Promise<SettingsResult> {
  return run(async () => {
    const user = await requireAccess(storeId.parse(sid), "configuracoes");
    await deleteStockUnit(sid, id);
    await audit(sid, user.email, `Excluiu a unidade de uso ${id}`, "trash-2");
    refresh();
  });
}

// ---------------------------------------------------------------- Financeiro: categorias

const financeCategorySchema = z.object({
  storeId,
  name,
  direction: z.enum(["in", "out"]),
  color,
});

export async function createFinanceCategoryAction(
  input: z.input<typeof financeCategorySchema>,
): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, ...data } = financeCategorySchema.parse(input);
    // Anyone who can record lançamentos may add a category inline from the sheet.
    const user = await requireAccess(sid, "financeiro");
    const id = await createFinanceCategory(sid, data);
    await audit(sid, user.email, `Criou a categoria de lançamento ${data.name}`, "tag");
    refresh();
    return id;
  });
}

export async function updateFinanceCategoryAction(
  id: string,
  input: z.input<typeof financeCategorySchema>,
): Promise<SettingsResult> {
  return run(async () => {
    const { storeId: sid, name: catName, color: catColor } = financeCategorySchema.parse(input);
    const user = await requireAccess(sid, "configuracoes");
    await updateFinanceCategory(sid, id, { name: catName, color: catColor });
    await audit(sid, user.email, `Editou a categoria de lançamento ${catName}`, "tag");
    refresh();
  });
}

export async function deleteFinanceCategoryAction(sid: string, id: string, moveToId?: string): Promise<SettingsResult> {
  return run(async () => {
    const user = await requireAccess(storeId.parse(sid), "configuracoes");
    await deleteFinanceCategory(sid, id, moveToId);
    await audit(sid, user.email, `Excluiu a categoria de lançamento ${id}`, "trash-2");
    refresh();
  });
}
