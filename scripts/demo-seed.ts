/**
 * Demo data for local/visual review only (NOT for prod). Populates a store with
 * a handful of customers, orders across every status, and finance rows so the
 * list pages render populated when comparing against the design mockup.
 *
 * Usage: FIRESTORE_EMULATOR_HOST=localhost:8080 tsx scripts/demo-seed.ts [storeId]
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

const PROJECT = "selet-prod";
const storeId = process.argv[2] ?? "vila-velha";

function daysAgo(n: number): Timestamp {
  return Timestamp.fromMillis(Date.now() - n * 86_400_000);
}

/** Short order code, mirroring orderCode() in src/lib/format.ts. */
function orderCode(id: string): string {
  return id.slice(0, 4).toUpperCase();
}

interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  city: string;
  instagram?: string;
  tags: string[];
  birthday?: { day: number; month: number };
  orderCount: number;
  totalSpent: number;
  lastOrderDays: number | null;
  avgReorderDays: number | null;
}

const CUSTOMERS: DemoCustomer[] = [
  { id: "cust-ana", name: "Ana Beatriz Souza", phone: "27 99912-3344", city: "Vila Velha/ES", instagram: "anabia", tags: ["fiel", "shakes"], birthday: { day: 12, month: 7 }, orderCount: 14, totalSpent: 52400, lastOrderDays: 3, avgReorderDays: 9 },
  { id: "cust-carlos", name: "Carlos Menezes", phone: "27 99880-1122", city: "Vila Velha/ES", instagram: "carlosmnz", tags: ["proteico"], orderCount: 6, totalSpent: 21800, lastOrderDays: 21, avgReorderDays: 14 },
  { id: "cust-juliana", name: "Juliana Prado", phone: "27 99771-5566", city: "Vitória/ES", tags: ["novo"], birthday: { day: 3, month: 8 }, orderCount: 1, totalSpent: 3600, lastOrderDays: 2, avgReorderDays: null },
  { id: "cust-marcos", name: "Marcos Vinícius", phone: "27 99655-7788", city: "Vila Velha/ES", instagram: "marcosvf", tags: ["reativar"], orderCount: 9, totalSpent: 39600, lastOrderDays: 48, avgReorderDays: 12 },
  { id: "cust-patricia", name: "Patrícia Gomes", phone: "27 99544-9900", city: "Cariacica/ES", tags: ["fiel", "waffle"], orderCount: 22, totalSpent: 88100, lastOrderDays: 5, avgReorderDays: 7 },
];

interface DemoOrder {
  customer: DemoCustomer;
  channel: "instagram" | "whatsapp" | "loja";
  status: "novo" | "preparando" | "entrega" | "concluido" | "cancelado";
  items: { productId: string; name: string; qty: number; unitPrice: number; addons?: string[] }[];
  paid: boolean;
  payMethod: "pix" | "cartao" | "dinheiro" | null;
  createdDays: number;
}

const ORDERS: DemoOrder[] = [
  { customer: CUSTOMERS[0], channel: "instagram", status: "novo", paid: false, payMethod: null, createdDays: 0, items: [ { productId: "shake-oreo", name: "Oreo", qty: 1, unitPrice: 3600, addons: ["Protein Crunch"] }, { productId: "shake-frutas-vermelhas", name: "Frutas Vermelhas", qty: 1, unitPrice: 3600 } ] },
  { customer: CUSTOMERS[4], channel: "whatsapp", status: "preparando", paid: true, payMethod: "pix", createdDays: 0, items: [ { productId: "waffle-proteico", name: "Waffle Proteico", qty: 2, unitPrice: 3100 } ] },
  { customer: CUSTOMERS[1], channel: "loja", status: "entrega", paid: true, payMethod: "cartao", createdDays: 1, items: [ { productId: "shake-ovomaltine", name: "Ovomaltine", qty: 1, unitPrice: 4100 } ] },
  { customer: CUSTOMERS[2], channel: "instagram", status: "concluido", paid: true, payMethod: "pix", createdDays: 2, items: [ { productId: "shake-frutas-vermelhas", name: "Frutas Vermelhas", qty: 1, unitPrice: 3600 } ] },
  { customer: CUSTOMERS[3], channel: "whatsapp", status: "cancelado", paid: false, payMethod: null, createdDays: 4, items: [ { productId: "shake-bombom-serenata", name: "Bombom Serenata", qty: 1, unitPrice: 4400 } ] },
  { customer: CUSTOMERS[4], channel: "loja", status: "concluido", paid: true, payMethod: "dinheiro", createdDays: 6, items: [ { productId: "shake-oreo", name: "Oreo", qty: 3, unitPrice: 3600 } ] },
];

async function main() {
  process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT });
  const db: Firestore = getFirestore(app);
  const store = db.collection("stores").doc(storeId);

  for (const c of CUSTOMERS) {
    await store.collection("customers").doc(c.id).set({
      name: c.name,
      nameLower: c.name.toLowerCase(),
      phone: c.phone,
      city: c.city,
      instagram: c.instagram ?? null,
      tags: c.tags,
      birthday: c.birthday ?? null,
      since: daysAgo(120),
      archived: false,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      lastOrderAt: c.lastOrderDays == null ? null : daysAgo(c.lastOrderDays),
      avgReorderDays: c.avgReorderDays,
    });
  }

  let n = 0;
  for (const o of ORDERS) {
    const ref = store.collection("orders").doc(`demo-order-${n++}`);
    const total = o.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const when = daysAgo(o.createdDays);
    await ref.set({
      customerId: o.customer.id,
      customerName: o.customer.name,
      channel: o.channel,
      items: o.items,
      total,
      status: o.status,
      paid: o.paid,
      payMethod: o.paid ? o.payMethod : null,
      createdAt: when,
      updatedAt: when,
    });
    if (o.paid) {
      await store.collection("finance").doc(`order-${ref.id}`).set({
        label: `Pedido #${orderCode(ref.id)} · ${o.customer.name}`,
        category: "vendas",
        amount: total,
        direction: "in",
        source: "order",
        orderId: ref.id,
        payMethod: o.payMethod,
        date: when,
      });
    }
  }

  const manual = [
    { label: "Compra de insumos Herbalife", category: "insumos", amount: 48000, direction: "out" as const, days: 8 },
    { label: "Aluguel do ponto", category: "operacao", amount: 120000, direction: "out" as const, days: 5 },
    { label: "Venda avulsa balcão", category: "vendas", amount: 5400, direction: "in" as const, days: 1 },
  ];
  let m = 0;
  for (const t of manual) {
    await store.collection("finance").doc(`demo-manual-${m++}`).set({
      label: t.label,
      category: t.category,
      amount: t.amount,
      direction: t.direction,
      source: "manual",
      date: daysAgo(t.days),
    });
  }

  console.log(`Demo seed ok em ${storeId}: ${CUSTOMERS.length} clientes, ${ORDERS.length} pedidos, ${manual.length} lançamentos manuais`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
