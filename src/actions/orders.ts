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
import { ORDER_CHANNELS, ORDER_STATUSES, PAY_METHODS } from "@/lib/types";
import type { ActionResult } from "./products";

const orderItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
  addons: z.array(z.string()).optional(),
});

const orderSchema = z.object({
  storeId: z.string().min(1),
  customerId: z.string().nullable(),
  customerName: z.string().trim().min(1, "Informe o cliente."),
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
    await createOrder(storeId, data, { paid, payMethod }, user.email);
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
    await requireAccess(storeId, "pedidos");
    await setOrderPayment(storeId, orderId, paid, payMethod);
    revalidate(storeId);
  });
}
