import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import { readSummary } from "./summary";
import {
  createVoucherTemplate,
  getVoucher,
  redeemVoucherItem,
  sellVoucher,
  setVoucherPayment,
} from "./vouchers";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const TEMPLATE_INPUT = {
  name: "Semana Fit",
  items: [{ productId: "p1", name: "Shake da Beleza", unitPrice: 4400, qty: 5 }],
  packagePrice: 20000,
  validityDays: 30,
};

async function financeDoc(storeId: string, voucherId: string) {
  const snap = await getDb().doc(`stores/${storeId}/finance/voucher-${voucherId}`).get();
  return snap.exists ? snap.data()! : null;
}

describe.skipIf(!hasEmulator)("vouchers repository (emulator)", () => {
  it("selling a paid voucher snapshots the template and mirrors into finance + summary", async () => {
    const storeId = `test-vouchers-a-${Date.now()}`;
    const templateId = await createVoucherTemplate(storeId, TEMPLATE_INPUT);

    const voucherId = await sellVoucher(
      storeId,
      { customerId: "c1", customerName: "Mariana", templateId },
      { paid: true, payMethod: "pix" },
    );

    const voucher = await getVoucher(storeId, voucherId);
    expect(voucher).toMatchObject({
      templateName: "Semana Fit",
      packagePrice: 20000,
      paid: true,
      payMethod: "pix",
      hasBalance: true,
    });
    expect(voucher?.items).toEqual([
      { productId: "p1", name: "Shake da Beleza", unitPrice: 4400, qty: 5, redeemedCount: 0 },
    ]);
    expect(voucher?.expiresAt).toBeTruthy();

    const tx = await financeDoc(storeId, voucherId);
    expect(tx).toMatchObject({ amount: 20000, direction: "in", source: "voucher" });

    const summary = await readSummary(storeId);
    const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    expect(summary?.months[mk]?.in).toBeGreaterThanOrEqual(20000);
  });

  it("selling an unpaid voucher creates no finance mirror", async () => {
    const storeId = `test-vouchers-b-${Date.now()}`;
    const templateId = await createVoucherTemplate(storeId, TEMPLATE_INPUT);

    const voucherId = await sellVoucher(
      storeId,
      { customerId: "c1", customerName: "Mariana", templateId },
      { paid: false, payMethod: null },
    );

    const voucher = await getVoucher(storeId, voucherId);
    expect(voucher?.paid).toBe(false);
    expect(await financeDoc(storeId, voucherId)).toBeNull();
  });

  it("a template with no validityDays sells with a null expiresAt", async () => {
    const storeId = `test-vouchers-c-${Date.now()}`;
    const templateId = await createVoucherTemplate(storeId, {
      ...TEMPLATE_INPUT,
      validityDays: null,
    });
    const voucherId = await sellVoucher(
      storeId,
      { customerId: "c1", customerName: "Rafael", templateId },
      { paid: false, payMethod: null },
    );
    const voucher = await getVoucher(storeId, voucherId);
    expect(voucher?.expiresAt).toBeNull();
  });

  it("redeeming decrements the balance and flips hasBalance once exhausted", async () => {
    const storeId = `test-vouchers-d-${Date.now()}`;
    const templateId = await createVoucherTemplate(storeId, {
      ...TEMPLATE_INPUT,
      items: [{ productId: "p1", name: "Shake da Beleza", unitPrice: 4400, qty: 2 }],
    });
    const voucherId = await sellVoucher(
      storeId,
      { customerId: "c1", customerName: "Mariana", templateId },
      { paid: true, payMethod: "pix" },
    );

    await redeemVoucherItem(storeId, voucherId, "p1");
    let voucher = await getVoucher(storeId, voucherId);
    expect(voucher?.items[0].redeemedCount).toBe(1);
    expect(voucher?.hasBalance).toBe(true);

    await redeemVoucherItem(storeId, voucherId, "p1");
    voucher = await getVoucher(storeId, voucherId);
    expect(voucher?.items[0].redeemedCount).toBe(2);
    expect(voucher?.hasBalance).toBe(false);

    await expect(redeemVoucherItem(storeId, voucherId, "p1")).rejects.toThrow(
      /Nenhum item disponível/,
    );
  });

  it("redeeming an expired voucher is rejected", async () => {
    const storeId = `test-vouchers-e-${Date.now()}`;
    const templateId = await createVoucherTemplate(storeId, {
      ...TEMPLATE_INPUT,
      validityDays: 1,
    });
    const voucherId = await sellVoucher(
      storeId,
      { customerId: "c1", customerName: "Mariana", templateId },
      { paid: true, payMethod: "pix" },
    );
    // Force the voucher into the past without waiting a day.
    await getDb()
      .doc(`stores/${storeId}/vouchers/${voucherId}`)
      .update({ expiresAt: new Date(Date.now() - 60_000) });

    await expect(redeemVoucherItem(storeId, voucherId, "p1")).rejects.toThrow(/expirado/);
  });

  it("payment toggle creates/deletes exactly one finance doc (idempotent)", async () => {
    const storeId = `test-vouchers-f-${Date.now()}`;
    const templateId = await createVoucherTemplate(storeId, TEMPLATE_INPUT);
    const voucherId = await sellVoucher(
      storeId,
      { customerId: "c1", customerName: "Mariana", templateId },
      { paid: false, payMethod: null },
    );

    await setVoucherPayment(storeId, voucherId, true, "cartao");
    await setVoucherPayment(storeId, voucherId, true, "cartao"); // repeat: no dup
    let tx = await financeDoc(storeId, voucherId);
    expect(tx).toMatchObject({ amount: 20000, direction: "in", source: "voucher" });

    await setVoucherPayment(storeId, voucherId, false, null);
    tx = await financeDoc(storeId, voucherId);
    expect(tx).toBeNull();
  });
});
