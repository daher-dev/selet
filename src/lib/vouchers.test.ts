import { describe, expect, it } from "vitest";
import type { Voucher, VoucherLineItem, VoucherTemplateItem } from "./types";
import {
  computeHasBalance,
  computeSavings,
  daysUntil,
  expiresAtFromValidity,
  isExpired,
  isExpiringSoon,
  lineHasBalance,
  remaining,
  voucherBalanceValue,
  voucherCode,
  voucherPills,
} from "./vouchers";

function line(qty: number, redeemedCount: number, over: Partial<VoucherLineItem> = {}): VoucherLineItem {
  return { productId: "p1", name: "Item", unitPrice: 1000, qty, redeemedCount, ...over };
}

describe("voucherCode", () => {
  it("uppercases the first 4 chars of the id", () => {
    expect(voucherCode("abcd1234")).toBe("ABCD");
  });
});

describe("remaining / lineHasBalance / computeHasBalance", () => {
  it("derives remaining from qty - redeemedCount, never negative", () => {
    expect(remaining(line(5, 2))).toBe(3);
    expect(remaining(line(5, 5))).toBe(0);
    expect(remaining(line(5, 9))).toBe(0);
  });

  it("lineHasBalance is true only when something remains", () => {
    expect(lineHasBalance(line(5, 2))).toBe(true);
    expect(lineHasBalance(line(5, 5))).toBe(false);
  });

  it("computeHasBalance is true if ANY line still has balance", () => {
    expect(computeHasBalance([line(5, 5), line(3, 1)])).toBe(true);
    expect(computeHasBalance([line(5, 5), line(3, 3)])).toBe(false);
    expect(computeHasBalance([])).toBe(false);
  });
});

describe("isExpired / isExpiringSoon", () => {
  const now = new Date("2026-08-15T12:00:00Z");

  it("null expiresAt never expires and never expires-soon", () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpiringSoon(null, now)).toBe(false);
  });

  it("a past date is expired", () => {
    expect(isExpired("2026-08-01T00:00:00Z", now)).toBe(true);
    expect(isExpired("2026-08-20T00:00:00Z", now)).toBe(false);
  });

  it("expiring-soon window defaults to 7 days, inclusive of now", () => {
    expect(isExpiringSoon(now.toISOString(), now)).toBe(true);
    expect(isExpiringSoon("2026-08-20T12:00:00Z", now)).toBe(true); // +5d
    expect(isExpiringSoon("2026-08-23T12:01:00Z", now)).toBe(false); // just past +8d
    expect(isExpiringSoon("2026-08-10T00:00:00Z", now)).toBe(false); // already past
  });
});

describe("voucherPills", () => {
  const now = new Date("2026-08-15T12:00:00Z");

  function voucher(over: Partial<Voucher>): Voucher {
    return {
      id: "v1",
      code: "V001",
      templateId: "t1",
      templateName: "Modelo",
      customerId: "c1",
      customerName: "Cliente",
      items: [line(5, 0)],
      packagePrice: 10000,
      purchasedAt: now.toISOString(),
      expiresAt: null,
      paid: true,
      payMethod: "pix",
      hasBalance: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...over,
    };
  }

  it("ativo when far from expiry", () => {
    expect(voucherPills(voucher({ expiresAt: "2026-09-15T00:00:00Z" }), now).status).toBe(
      "ativo",
    );
  });

  it("vence-em-breve within the window", () => {
    expect(voucherPills(voucher({ expiresAt: "2026-08-18T00:00:00Z" }), now).status).toBe(
      "vence-em-breve",
    );
  });

  it("expirado once past expiresAt", () => {
    expect(voucherPills(voucher({ expiresAt: "2026-08-01T00:00:00Z" }), now).status).toBe(
      "expirado",
    );
  });

  it("unpaid and noExpiry flags reflect the voucher fields, independent of status", () => {
    const pills = voucherPills(voucher({ paid: false, expiresAt: null }), now);
    expect(pills.unpaid).toBe(true);
    expect(pills.noExpiry).toBe(true);
    expect(pills.status).toBe("ativo");
  });
});

describe("expiresAtFromValidity / daysUntil", () => {
  it("null validity → null expiry", () => {
    expect(expiresAtFromValidity(new Date("2026-08-01"), null)).toBeNull();
  });

  it("adds validityDays to the purchase date", () => {
    const iso = expiresAtFromValidity(new Date("2026-08-01T00:00:00Z"), 30);
    expect(iso).toBe("2026-08-31T00:00:00.000Z");
  });

  it("daysUntil rounds up and floors at 0", () => {
    const now = new Date("2026-08-15T00:00:00Z");
    expect(daysUntil("2026-08-16T01:00:00Z", now)).toBe(2); // >1 day, rounds up
    expect(daysUntil("2026-08-01T00:00:00Z", now)).toBe(0); // past
    expect(daysUntil(null, now)).toBe(0);
  });
});

describe("computeSavings", () => {
  it("computes sum, savings, and rounded discount percentage", () => {
    const items: VoucherTemplateItem[] = [
      { productId: "a", name: "Shake da Beleza", unitPrice: 4400, qty: 5 },
      { productId: "b", name: "Hype Drink", unitPrice: 2800, qty: 5 },
    ];
    // sum = 5*4400 + 5*2800 = 22000 + 14000 = 36000
    const { sum, savings, discountPct } = computeSavings(items, 30000);
    expect(sum).toBe(36000);
    expect(savings).toBe(6000);
    expect(discountPct).toBe(17); // 6000/36000 = 16.67% rounded
  });

  it("never returns negative savings when the package costs more than the sum", () => {
    const items: VoucherTemplateItem[] = [{ productId: "a", name: "X", unitPrice: 1000, qty: 1 }];
    const { savings, discountPct } = computeSavings(items, 5000);
    expect(savings).toBe(0);
    expect(discountPct).toBe(0);
  });

  it("discountPct is 0 when there are no items (avoids division by zero)", () => {
    expect(computeSavings([], 0).discountPct).toBe(0);
  });
});

describe("voucherBalanceValue", () => {
  it("allocates the package price proportionally to remaining quantity", () => {
    const voucher: Voucher = {
      id: "v1",
      code: "V001",
      templateId: "t1",
      templateName: "Semana Fit",
      customerId: "c1",
      customerName: "Cliente",
      // 10 total units, 4 remaining (40%) of a 30000 package → 12000
      items: [line(5, 3), line(5, 3)],
      packagePrice: 30000,
      purchasedAt: new Date().toISOString(),
      expiresAt: null,
      paid: true,
      payMethod: "pix",
      hasBalance: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(voucherBalanceValue(voucher)).toBe(12000);
  });

  it("returns 0 for a voucher with no items", () => {
    const voucher: Voucher = {
      id: "v1",
      code: "V001",
      templateId: "t1",
      templateName: "X",
      customerId: "c1",
      customerName: "Cliente",
      items: [],
      packagePrice: 10000,
      purchasedAt: new Date().toISOString(),
      expiresAt: null,
      paid: true,
      payMethod: "pix",
      hasBalance: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(voucherBalanceValue(voucher)).toBe(0);
  });
});
