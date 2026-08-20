import { z } from "zod";
import { DISCOUNT_KINDS, DISCOUNT_REASONS, MAX_SHAKE_FLAVORS } from "./types";

/**
 * Pure Zod schemas for order data — split out from src/actions/orders.ts
 * (a "use server" file, not directly importable from a plain vitest test)
 * so they can be unit-tested on their own. This codebase has already lost a
 * field to Zod's silent-unknown-key-strip more than once (OrderItem.shake,
 * then shake.brinde) — every field here must be spelled out explicitly,
 * never z.record/passthrough, or a new one will vanish silently again.
 */

const shakeBrindeSelectionSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  listPrice: z.number().int().min(0),
  addons: z.array(z.object({ name: z.string().min(1), price: z.number().int().min(0) })).optional(),
});

const shakeSelectionSchema = z
  .object({
    flavorIds: z.array(z.string().min(1)).min(1).max(MAX_SHAKE_FLAVORS),
    baseId: z.string().nullable(),
    rims: z.array(z.object({ modifierId: z.string().min(1), qty: z.number().int().positive() })),
    mixins: z.array(z.object({ modifierId: z.string().min(1), qty: z.number().int().positive() })),
    utensilOverrides: z
      .array(z.object({ utensilId: z.string().min(1), included: z.boolean() }))
      .optional(),
    brinde: shakeBrindeSelectionSchema.optional(),
  })
  .superRefine((sel, ctx) => {
    if (new Set(sel.flavorIds).size !== sel.flavorIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Um shake não pode repetir o mesmo sabor.",
        path: ["flavorIds"],
      });
    }
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

export const orderItemSchema = z
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
    // cartelaSale is its own line (sells a brand-new cartela) and can never
    // share a line with a shake build or a cartela redemption. shake +
    // cartelaUse, though, is the normal "pay for this shake with a punch
    // card" case and must stay allowed.
    if (item.cartelaSale && (item.shake || item.cartelaUse)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Um item não pode combinar venda de cartela com shake ou uso de cartela.",
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

export type OrderItemInput = z.input<typeof orderItemSchema>;

/**
 * Manual, order-level discount (Part A). `value`'s meaning depends on `kind`
 * — centavos for "flat", a whole 1-100 for "percent", always 0 for "free" —
 * so the range check has to branch on `kind` inside a superRefine rather than
 * a single flat z.number() bound. `amount` is deliberately NOT part of this
 * input schema: it's always server-computed (src/lib/order-money.ts), never
 * trusted from the client, so there's no key here for a client-sent amount
 * to hide behind.
 */
export const discountSchema = z
  .object({
    kind: z.enum(DISCOUNT_KINDS),
    value: z.number().int(),
    reason: z.enum(DISCOUNT_REASONS).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "flat" && d.value < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um valor de desconto maior que zero.",
        path: ["value"],
      });
    }
    if (d.kind === "percent" && (d.value < 1 || d.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe uma porcentagem entre 1 e 100.",
        path: ["value"],
      });
    }
    if (d.kind === "free" && d.value !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Desconto grátis não deve informar um valor.",
        path: ["value"],
      });
    }
  });

export type DiscountFormInput = z.input<typeof discountSchema>;
