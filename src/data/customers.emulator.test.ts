import { describe, expect, it } from "vitest";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from "./customers";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("customers repository (emulator)", () => {
  const storeId = `test-customers-${Date.now()}`;

  it("creates a customer with zeroed aggregates", async () => {
    const id = await createCustomer(storeId, {
      name: "Maria Silva",
      phone: "27999990000",
      city: "Vila Velha/ES",
      instagram: "maria.silva",
      birthday: { day: 12, month: 3 },
      tags: ["vip"],
      notes: "Prefere entrega à tarde",
    });

    const customer = await getCustomer(storeId, id);
    expect(customer).toMatchObject({
      name: "Maria Silva",
      birthday: { day: 12, month: 3 },
      tags: ["vip"],
      archived: false,
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      avgReorderDays: null,
    });
    expect(customer?.since).toBeTruthy();
  });

  it("updates fields and clears birthday when omitted", async () => {
    const id = await createCustomer(storeId, {
      name: "João Souza",
      birthday: { day: 1, month: 1 },
      tags: [],
    });

    await updateCustomer(storeId, id, { name: "João S. Souza", tags: [] });
    const customer = await getCustomer(storeId, id);
    expect(customer?.name).toBe("João S. Souza");
    expect(customer?.birthday).toBeUndefined();
  });

  it("archives and reactivates", async () => {
    const id = await createCustomer(storeId, { name: "Ana", tags: [] });
    await setCustomerArchived(storeId, id, true);
    expect((await getCustomer(storeId, id))?.archived).toBe(true);
    await setCustomerArchived(storeId, id, false);
    expect((await getCustomer(storeId, id))?.archived).toBe(false);
  });

  it("orders list by name", async () => {
    const names = (await listCustomers(storeId)).map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
