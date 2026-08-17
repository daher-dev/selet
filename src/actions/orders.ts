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
import { orderMoney } from "@/lib/order-money";
import { discountSchema, orderItemSchema } from "@/lib/order-schema";
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

// "Data da venda" backdating window (Part A point 2). Past bound is a real
// correctness constraint, not an arbitrary UX limit: src/data/orders.ts's
// summary system prunes to the 18 most recent non-empty months on write but
// NOT on a fresh recompute (see summary.emulator.test.ts's expectConsistent),
// so a single order can touch at most `current month + 12 back` = 13 monthly
// buckets and stay inside that window on both sides. The future bound only
// needs to absorb clock skew — nobody is legitimately backdating INTO the
// future.
const MAX_BACKDATE_MONTHS = 12;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function subtractMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Shared by orderSchema and createOrderSchema (see the ZodObject/ZodEffects
 *  split below — a superRefine'd schema loses `.extend()`, so this refine is
 *  applied separately to each, after createOrderSchema's own `.extend()`). */
function refineCreatedAtWindow(
  data: { createdAt?: string },
  ctx: z.RefinementCtx,
): void {
  if (!data.createdAt) return;
  const dt = new Date(data.createdAt);
  if (Number.isNaN(dt.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Data da venda inválida.",
      path: ["createdAt"],
    });
    return;
  }
  const now = new Date();
  const minDate = subtractMonths(now, MAX_BACKDATE_MONTHS);
  const maxDate = new Date(now.getTime() + CLOCK_SKEW_MS);
  if (dt.getTime() < minDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data da venda não pode ser mais de 12 meses no passado.",
      path: ["createdAt"],
    });
  } else if (dt.getTime() > maxDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data da venda não pode estar no futuro.",
      path: ["createdAt"],
    });
  }
}

const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

// Plain ZodObject (no superRefine yet) so createOrderSchema below can still
// `.extend()` it with paid/payMethod — z.object(...).superRefine(...) returns
// a ZodEffects, which has no `.extend()`. Both orderSchema and
// createOrderSchema apply refineCreatedAtWindow themselves, after their own
// shape is final.
const orderShape = z.object({
  storeId: z.string().min(1),
  customerId: z.string().trim().min(1, "Selecione um cliente."),
  customerName: z.string().trim().min(1, "Selecione um cliente."),
  channel: z.enum(ORDER_CHANNELS),
  items: z.array(orderItemSchema).min(1, "Adicione ao menos um item."),
  // Manual order-level discount (Part A) — spelled out via discountSchema
  // (never z.record/passthrough), null clears an existing discount on edit,
  // undefined leaves it as "no discount". `amount` is never a client input
  // key here: it's always server-computed by orderMoney().
  discount: discountSchema.nullable().optional(),
  // Free-text order note — team-only, never shown in the Pedidos list rows.
  notes: z.string().trim().max(500, "A nota pode ter no máximo 500 caracteres.").optional(),
  // ISO datetime "Data da venda". Create mode's "Agora" toggle omits this
  // entirely (server defaults to now()); edit mode always sends the current
  // (possibly moved) value. Window-checked by refineCreatedAtWindow below.
  createdAt: z.string().trim().min(1).optional(),
});

const orderSchema = orderShape.superRefine(refineCreatedAtWindow);

const createOrderSchema = orderShape
  .extend({
    paid: z.boolean().default(false),
    payMethod: z.enum(PAY_METHODS).nullable().default(null),
  })
  .superRefine(refineCreatedAtWindow);

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
    // Same zero-total guard src/data/orders.ts's createOrder enforces inside
    // its transaction — checked here too so it surfaces as a clean
    // ActionResult (via `run`'s catch) before any Firestore work starts,
    // rather than only failing deep inside the transaction.
    const { total } = orderMoney(data.items, data.discount);
    if (paid && total === 0) {
      throw new Error(
        'Pedido sem valor não pode ser marcado como pago — use "Nada a cobrar".',
      );
    }
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
