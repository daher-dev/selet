"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  createOrder,
  setOrderPayment,
  setOrderStatus,
  updateOrder,
} from "@/data/orders";
import { logActivity } from "@/data/activity";
import { orderCode } from "@/lib/format";
import {
  ORDER_CHANNELS,
  ORDER_STATUSES,
  PAY_METHODS,
  type OrderChannel,
  type PayMethod,
} from "@/lib/types";
import type { ActionResult } from "./products";

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  loja: "Loja",
};

const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

const shakeSelectionSchema = z.object({
  flavorId: z.string().min(1),
  baseId: z.string().nullable(),
  rims: z.array(z.object({ modifierId: z.string().min(1), qty: z.number().int().positive() })),
  mixins: z.array(z.object({ modifierId: z.string().min(1), qty: z.number().int().positive() })),
  utensilOverrides: z
    .array(z.object({ utensilId: z.string().min(1), included: z.boolean() }))
    .optional(),
});

// The line that SELLS a brand-new cartela — qty is always 1 (enforced below).
const cartelaSaleSchema = z.object({
  paidUses: z.number().int().min(1),
  totalUses: z.number().int().min(2),
  unitValue: z.number().int().min(1),
});

// A line a cartela paid down. `covered` is the PER-UNIT discount (constant
// across the line's qty, same convention as addons folding into unitPrice);
// `uses` is the total punches this line consumes — enforced === qty below,
// since decision #1 forbids partially covering a multi-unit line.
const cartelaUseSchema = z.object({
  cartelaId: z.string().min(1),
  code: z.string().min(1),
  uses: z.number().int().min(1),
  covered: z.number().int().min(1),
  listPrice: z.number().int().min(0),
});

const orderItemSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    qty: z.number().int().min(1),
    unitPrice: z.number().int().min(0),
    addons: z.array(z.string()).optional(),
    // "Montar shake" lines carry their picks here instead of addons — without
    // this, z.object() silently strips the field (unrecognized keys are
    // dropped, not rejected), so the order would save with no shake data and
    // the consumption engine would never draw the flavor/modifier stock.
    shake: shakeSelectionSchema.optional(),
    // Same silent-strip risk applies to cartela lines — spelling both out
    // explicitly (rather than z.record/passthrough) is what keeps a redeemed
    // or sold cartela line from vanishing on save.
    cartelaSale: cartelaSaleSchema.optional(),
    cartelaUse: cartelaUseSchema.optional(),
  })
  .superRefine((item, ctx) => {
    const exclusive = [item.shake, item.cartelaSale, item.cartelaUse].filter(
      (v) => v !== undefined,
    ).length;
    if (exclusive > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Um item não pode combinar shake, venda de cartela e uso de cartela.",
        path: [],
      });
    }
    if (item.cartelaSale && item.cartelaSale.totalUses !== item.cartelaSale.paidUses + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "totalUses deve ser paidUses + 1 (o brinde).",
        path: ["cartelaSale", "totalUses"],
      });
    }
    if (item.cartelaSale && item.qty !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A venda de uma cartela deve ser uma linha de quantidade 1.",
        path: ["qty"],
      });
    }
    if (item.cartelaUse) {
      if (item.cartelaUse.uses !== item.qty) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "O número de usos da cartela deve ser igual à quantidade do item.",
          path: ["cartelaUse", "uses"],
        });
      }
      if (item.unitPrice !== item.cartelaUse.listPrice - item.cartelaUse.covered) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "O preço do item não corresponde ao valor coberto pela cartela.",
          path: ["unitPrice"],
        });
      }
    }
  });

const orderSchema = z.object({
  storeId: z.string().min(1),
  customerId: z.string().trim().min(1, "Selecione um cliente."),
  customerName: z.string().trim().min(1, "Selecione um cliente."),
  channel: z.enum(ORDER_CHANNELS),
  items: z.array(orderItemSchema).min(1, "Adicione ao menos um item."),
});

const createOrderSchema = orderSchema.extend({
  paid: z.boolean().default(false),
  payMethod: z.enum(PAY_METHODS).nullable().default(null),
});

export type OrderFormInput = z.input<typeof orderSchema>;
export type CreateOrderInput = z.input<typeof createOrderSchema>;

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
  revalidatePath(`/s/${storeId}/pedidos`);
  revalidatePath(`/s/${storeId}/clientes`);
  revalidatePath(`/s/${storeId}/financeiro`);
  revalidatePath(`/s/${storeId}`);
}

export async function createOrderAction(
  input: CreateOrderInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, paid, payMethod, ...data } = createOrderSchema.parse(input);
    if (paid && !payMethod) throw new Error("Selecione a forma de pagamento.");
    const user = await requireAccess(storeId, "pedidos");
    const orderId = await createOrder(storeId, data, { paid, payMethod }, user.email);
    const code = orderCode(orderId);
    await logActivity(storeId, {
      icon: "inbox",
      label: `Registrou pedido #${code}`,
      detail: `Pedidos · ${CHANNEL_LABEL[data.channel]}`,
      by: user.email,
      section: "pedidos",
    });
    if (paid && payMethod) {
      await logActivity(storeId, {
        icon: "wallet",
        label: `Recebeu pagamento · #${code}`,
        detail: `Pedidos · ${PAY_METHOD_LABEL[payMethod]}`,
        by: user.email,
        section: "pedidos",
      });
    }
    revalidate(storeId);
  });
}

export async function updateOrderAction(
  orderId: string,
  input: OrderFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = orderSchema.parse(input);
    const user = await requireAccess(storeId, "pedidos");
    await updateOrder(storeId, orderId, data, user.email);
    revalidate(storeId);
  });
}

const statusSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  status: z.enum(ORDER_STATUSES),
});

export async function setOrderStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, orderId, status } = statusSchema.parse(input);
    const user = await requireAccess(storeId, "pedidos");
    await setOrderStatus(storeId, orderId, status, user.email);
    const code = orderCode(orderId);
    if (status === "concluido") {
      await logActivity(storeId, {
        icon: "circle-check",
        label: `Concluiu pedido #${code}`,
        detail: "Pedidos",
        by: user.email,
        section: "pedidos",
      });
    } else if (status === "cancelado") {
      await logActivity(storeId, {
        icon: "ban",
        label: `Cancelou pedido #${code}`,
        detail: "Pedidos",
        by: user.email,
        section: "pedidos",
      });
    }
    revalidate(storeId);
  });
}

const paymentSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  paid: z.boolean(),
  payMethod: z.enum(PAY_METHODS).nullable(),
});

export async function setOrderPaymentAction(
  input: z.input<typeof paymentSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, orderId, paid, payMethod } = paymentSchema.parse(input);
    if (paid && !payMethod) {
      throw new Error("Selecione a forma de pagamento.");
    }
    const user = await requireAccess(storeId, "pedidos");
    await setOrderPayment(storeId, orderId, paid, payMethod);
    if (paid && payMethod) {
      await logActivity(storeId, {
        icon: "wallet",
        label: `Recebeu pagamento · #${orderCode(orderId)}`,
        detail: `Pedidos · ${PAY_METHOD_LABEL[payMethod]}`,
        by: user.email,
        section: "pedidos",
      });
    }
    revalidate(storeId);
  });
}
