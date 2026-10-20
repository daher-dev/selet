import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { monthKey } from "@/lib/timezone";
import { backfillCommissions } from "./commission-backfill";
import { refreshStoreSummary } from "./summary";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const SINCE = new Date("2026-09-01T03:00:00Z");
const day = (iso: string) => Timestamp.fromDate(new Date(iso));

describe.skipIf(!hasEmulator)("commission backfill (emulator)", () => {
  it("stamps lines, resolves the seller from the activity log and fills paid mirrors — idempotently", async () => {
    const db = getDb();
    const storeId = `test-backfill-${Date.now()}`;
    const email = `barbara-${Date.now()}@selet.test`;
    const base = db.doc(`stores/${storeId}`);
    await db.doc(`users/${email}`).set({ name: "Barbara", role: "admin", status: "ativo", storeIds: "all", sections: [] });

    await base.collection("products").doc("creatina").set({ name: "Creatina", price: 18100, saleType: "revenda" });
    await base.collection("products").doc("barra").set({ name: "Barra", price: 1800, saleType: "revenda" });

    const line = (productId: string, name: string, qty: number, unitPrice: number) => ({
      productId, name, qty, unitPrice, saleType: "revenda",
    });
    const order = (over: Record<string, unknown>) => ({
      customerId: null, customerName: "Balcão", channel: "loja", status: "concluido",
      paid: true, payMethod: "pix", discount: null, createdAt: day("2026-10-01T15:00:00Z"),
      updatedAt: day("2026-10-01T15:00:00Z"), stockConsumed: [], cartelaConsumed: [], cartelaSold: [],
      ...over,
    });
    // A: paid Creatina (+ mirror).  B: unpaid Creatina ×2.  C: no commissioned line.
    // D: Creatina, nobody logged it.  E: older than the window.
    await base.collection("orders").doc("AAA1").set(order({ items: [line("creatina", "Creatina", 1, 18100)], total: 18100 }));
    await base.collection("finance").doc("order-AAA1").set({
      label: "Pedido #AAA1", category: "vendas", amount: 18100, direction: "in", source: "order",
      orderId: "AAA1", payMethod: "pix", date: day("2026-10-01T15:00:00Z"),
    });
    await base.collection("orders").doc("BBB1").set(order({ items: [line("creatina", "Creatina", 2, 18100)], total: 36200, paid: false, payMethod: null }));
    await base.collection("orders").doc("CCC1").set(order({ items: [line("barra", "Barra", 1, 1800)], total: 1800 }));
    await base.collection("orders").doc("DDD1").set(order({ items: [line("creatina", "Creatina", 1, 18100)], total: 18100, paid: false, payMethod: null }));
    await base.collection("orders").doc("EEE1").set(order({ items: [line("creatina", "Creatina", 1, 18100)], total: 18100, createdAt: day("2026-07-10T15:00:00Z") }));
    for (const code of ["AAA1", "BBB1", "CCC1"]) {
      await base.collection("activities").add({ label: `Registrou pedido #${code}`, by: email, at: Timestamp.now(), section: "pedidos" });
    }
    await refreshStoreSummary(db, storeId);

    const opts = { since: SINCE, rates: { Creatina: 15 } };

    // Dry run writes nothing but reports the plan.
    const dry = await backfillCommissions(db, storeId, { ...opts, apply: false });
    expect(dry).toMatchObject({ productsUpdated: 1, ordersConsidered: 3, ordersUpdated: 2, mirrorsUpdated: 1, totalCommission: 2715 });
    expect(dry.unresolved.map((u) => u.code)).toEqual(["DDD1"]);
    expect((await base.collection("products").doc("creatina").get()).data()?.commissionPercent).toBeUndefined();
    expect((await base.collection("orders").doc("AAA1").get()).data()?.sellerEmail).toBeUndefined();

    // Apply.
    const done = await backfillCommissions(db, storeId, { ...opts, apply: true });
    expect(done).toMatchObject({ ordersUpdated: 2, mirrorsUpdated: 1, totalCommission: 2715 });
    expect((await base.collection("products").doc("creatina").get()).data()?.commissionPercent).toBe(15);
    expect((await base.collection("products").doc("barra").get()).data()?.commissionPercent).toBeUndefined();

    const a = (await base.collection("orders").doc("AAA1").get()).data()!;
    expect(a).toMatchObject({ sellerEmail: email, sellerName: "Barbara" });
    expect(a.items[0].commissionPercent).toBe(15);
    expect((await base.collection("finance").doc("order-AAA1").get()).data()).toMatchObject({
      sellerEmail: email, commission: { amount: 2715, base: 18100, items: 1 },
    });
    // Unpaid B: stamped + seller now, accrues when paid (no mirror yet).
    const b = (await base.collection("orders").doc("BBB1").get()).data()!;
    expect(b).toMatchObject({ sellerEmail: email });
    expect(b.items[0].commissionPercent).toBe(15);
    expect((await base.collection("finance").doc("order-BBB1").get()).exists).toBe(false);
    // Untouched: no commissioned line, no seller found, outside the window.
    expect((await base.collection("orders").doc("CCC1").get()).data()?.sellerEmail).toBeUndefined();
    expect((await base.collection("orders").doc("DDD1").get()).data()?.sellerEmail).toBeUndefined();
    expect((await base.collection("orders").doc("EEE1").get()).data()?.sellerEmail).toBeUndefined();

    // The accrual is a Saída of the mirror's month.
    const summary = (await base.collection("meta").doc("summary").get()).data()!;
    expect(summary.months[monthKey(new Date("2026-10-01T15:00:00Z"))]).toMatchObject({ in: 18100, out: 2715 });

    // Idempotent.
    const again = await backfillCommissions(db, storeId, { ...opts, apply: true });
    expect(again).toMatchObject({ productsUpdated: 0, ordersUpdated: 0, mirrorsUpdated: 0 });

    // --seller covers the order nobody logged.
    const forced = await backfillCommissions(db, storeId, { ...opts, apply: true, sellerOverride: email });
    expect(forced.unresolved).toEqual([]);
    expect((await base.collection("orders").doc("DDD1").get()).data()?.sellerEmail).toBe(email);
  });
});
