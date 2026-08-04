"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  createVoucherTemplate,
  listVouchersByCustomer,
  redeemVoucherItem,
  sellVoucher,
  setVoucherPayment,
  setVoucherTemplateActive,
  updateVoucherTemplate,
} from "@/data/vouchers";
import { logActivity } from "@/data/activity";
import { voucherCode } from "@/lib/vouchers";
import { PAY_METHODS, type PayMethod, type Voucher } from "@/lib/types";
import type { ActionResult } from "./products";

const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

const templateItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().trim().min(1),
  unitPrice: z.number().int().min(0),
  qty: z.number().int().min(1),
});

const templateSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do modelo."),
  description: z.string().trim().max(280).optional(),
  items: z.array(templateItemSchema).min(1, "Adicione ao menos um item."),
  packagePrice: z.number().int().min(0),
  validityDays: z.number().int().min(1).nullable(),
});

export type VoucherTemplateFormInput = z.input<typeof templateSchema>;

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
  revalidatePath(`/s/${storeId}/vouchers`);
  revalidatePath(`/s/${storeId}`);
}

export async function createVoucherTemplateAction(
  input: VoucherTemplateFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = templateSchema.parse(input);
    const user = await requireAccess(storeId, "vouchers");
    await createVoucherTemplate(storeId, data);
    await logActivity(storeId, {
      icon: "ticket",
      label: `Criou modelo de voucher · ${data.name}`,
      detail: "Vouchers",
      by: user.email,
      section: "vouchers",
    });
    revalidate(storeId);
  });
}

export async function updateVoucherTemplateAction(
  templateId: string,
  input: VoucherTemplateFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = templateSchema.parse(input);
    const user = await requireAccess(storeId, "vouchers");
    await updateVoucherTemplate(storeId, templateId, data);
    await logActivity(storeId, {
      icon: "ticket",
      label: `Editou modelo de voucher · ${data.name}`,
      detail: "Vouchers",
      by: user.email,
      section: "vouchers",
    });
    revalidate(storeId);
  });
}

const setActiveSchema = z.object({
  storeId: z.string().min(1),
  templateId: z.string().min(1),
  active: z.boolean(),
});

export async function setVoucherTemplateActiveAction(
  input: z.input<typeof setActiveSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, templateId, active } = setActiveSchema.parse(input);
    const user = await requireAccess(storeId, "vouchers");
    await setVoucherTemplateActive(storeId, templateId, active);
    await logActivity(storeId, {
      icon: active ? "circle-check" : "ban",
      label: `${active ? "Reativou" : "Desativou"} modelo de voucher`,
      detail: "Vouchers",
      by: user.email,
      section: "vouchers",
    });
    revalidate(storeId);
  });
}

const sellSchema = z.object({
  storeId: z.string().min(1),
  customerId: z.string().trim().min(1, "Selecione um cliente."),
  customerName: z.string().trim().min(1, "Selecione um cliente."),
  templateId: z.string().min(1, "Selecione um modelo."),
  paid: z.boolean().default(false),
  payMethod: z.enum(PAY_METHODS).nullable().default(null),
});

export type SellVoucherInput = z.input<typeof sellSchema>;

export async function sellVoucherAction(
  input: SellVoucherInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, paid, payMethod, ...data } = sellSchema.parse(input);
    if (paid && !payMethod) throw new Error("Selecione a forma de pagamento.");
    const user = await requireAccess(storeId, "vouchers");
    const voucherId = await sellVoucher(storeId, data, { paid, payMethod });
    const code = voucherCode(voucherId);
    await logActivity(storeId, {
      icon: "ticket",
      label: `Vendeu voucher #${code} · ${data.customerName}`,
      detail: "Vouchers",
      by: user.email,
      section: "vouchers",
    });
    if (paid && payMethod) {
      await logActivity(storeId, {
        icon: "wallet",
        label: `Recebeu pagamento · voucher #${code}`,
        detail: `Vouchers · ${PAY_METHOD_LABEL[payMethod]}`,
        by: user.email,
        section: "vouchers",
      });
    }
    revalidate(storeId);
    revalidatePath(`/s/${storeId}/financeiro`);
  });
}

const paymentSchema = z.object({
  storeId: z.string().min(1),
  voucherId: z.string().min(1),
  paid: z.boolean(),
  payMethod: z.enum(PAY_METHODS).nullable(),
});

export async function setVoucherPaymentAction(
  input: z.input<typeof paymentSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, voucherId, paid, payMethod } = paymentSchema.parse(input);
    if (paid && !payMethod) throw new Error("Selecione a forma de pagamento.");
    const user = await requireAccess(storeId, "vouchers");
    await setVoucherPayment(storeId, voucherId, paid, payMethod);
    if (paid && payMethod) {
      await logActivity(storeId, {
        icon: "wallet",
        label: `Recebeu pagamento · voucher #${voucherCode(voucherId)}`,
        detail: `Vouchers · ${PAY_METHOD_LABEL[payMethod]}`,
        by: user.email,
        section: "vouchers",
      });
    }
    revalidate(storeId);
    revalidatePath(`/s/${storeId}/financeiro`);
  });
}

const redeemSchema = z.object({
  storeId: z.string().min(1),
  voucherId: z.string().min(1),
  productId: z.string().min(1),
});

export async function redeemVoucherItemAction(
  input: z.input<typeof redeemSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, voucherId, productId } = redeemSchema.parse(input);
    const user = await requireAccess(storeId, "vouchers");
    await redeemVoucherItem(storeId, voucherId, productId);
    await logActivity(storeId, {
      icon: "circle-check",
      label: `Registrou retirada · voucher #${voucherCode(voucherId)}`,
      detail: "Vouchers",
      by: user.email,
      section: "vouchers",
    });
    revalidate(storeId);
  });
}

/**
 * Read-only lookup for the Pedidos order drawer's voucher-balance banner —
 * skips the ActionResult wrapper like listMemberActivityAction, since it's a
 * lazy client-side fetch, not a form submit. Returns [] (rather than throwing)
 * when the caller lacks "vouchers" access, so the banner just stays hidden for
 * a funcionário without that grant instead of erroring the whole order drawer.
 */
export async function listVouchersByCustomerAction(
  storeId: string,
  customerId: string,
): Promise<Voucher[]> {
  try {
    await requireAccess(storeId, "vouchers");
  } catch {
    return [];
  }
  return listVouchersByCustomer(storeId, customerId);
}
