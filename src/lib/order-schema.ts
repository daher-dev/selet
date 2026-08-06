import { z } from "zod";

/**
 * Pure Zod schema for one order line — split out from src/actions/orders.ts
 * (a "use server" file, not directly importable from a plain vitest test)
 * so it can be unit-tested on its own. This codebase has already lost a
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

const shakeSelectionSchema = z.object({
  flavorId: z.string().min(1),
  baseId: z.string().nullable(),
  rims: z.array(z.object({ modifierId: z.string().min(1), qty: z.number().int().positive() })),
  mixins: z.array(z.object({ modifierId: z.string().min(1), qty: z.number().int().positive() })),
  utensilOverrides: z
    .array(z.object({ utensilId: z.string().min(1), included: z.boolean() }))
    .optional(),
  brinde: shakeBrindeSelectionSchema.optional(),
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

export type OrderItemInput = z.input<typeof orderItemSchema>;
