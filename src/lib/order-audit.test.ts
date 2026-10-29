import { describe, expect, it } from "vitest";
import { auditChanges, type AuditSnap } from "./order-audit";

const base: AuditSnap = {
  status: "novo", paid: true, payMethod: "pix", total: 26000, customerName: "Ana",
  channel: "loja", createdAt: "2026-09-18T15:33:00.000Z", sellerEmail: null, notes: null, items: ["1× Cartela"],
};

describe("auditChanges", () => {
  it("lists only what changed", () => {
    expect(auditChanges(base, { ...base, status: "cancelado", items: ["2× Cartela"] })).toEqual([
      { field: "status", from: "novo", to: "cancelado" },
      { field: "items", from: ["1× Cartela"], to: ["2× Cartela"] },
    ]);
  });
  it("is empty for a no-op", () => expect(auditChanges(base, { ...base })).toEqual([]));
  it("lists every non-null field on creation", () => {
    const fields = auditChanges(null, base).map((c) => c.field);
    expect(fields).toContain("total");
    expect(fields).not.toContain("sellerEmail");
  });
});
