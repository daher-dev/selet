/**
 * Demo data for local/visual review only (NOT for prod). Populates the stores
 * with the design's realistic roster (docs/design/Selet Admin.dc.html) — VIP
 * customers with birthdays/notes, tier-priced orders across every status/channel
 * with distinct human codes (#1039…#1048), and recurring finance expenses — so
 * the list pages render like the mockup.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 tsx scripts/demo-seed.ts [storeId]
 * With no arg it seeds every store; pass a storeId to seed just that one.
 *
 * Money is integer centavos. Idempotent: deterministic doc ids (customer slug,
 * numeric order code, finance slug), so re-running overwrites in place.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

const PROJECT = "selet-prod";
const STORE_IDS = ["vila-velha", "passos"] as const;
type StoreId = (typeof STORE_IDS)[number];

const arg = process.argv[2];
const targetStores: readonly StoreId[] = arg
  ? STORE_IDS.filter((s) => s === arg)
  : STORE_IDS;

function daysAgo(n: number): Timestamp {
  return Timestamp.fromMillis(Date.now() - n * 86_400_000);
}

function minutesAgo(n: number): Timestamp {
  return Timestamp.fromMillis(Date.now() - n * 60_000);
}

/** First day of the given month/year (customer "since"). */
function monthDate(month: number, year: number): Timestamp {
  return Timestamp.fromDate(new Date(year, month - 1, 1));
}

/** Short order code, mirroring orderCode() in src/lib/format.ts. */
function orderCode(id: string): string {
  return id.slice(0, 4).toUpperCase();
}

/** "carla-menezes" from "Carla Menezes". */
function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Customers (design `allCustomers`, 2055) — 8 across both stores.
// ---------------------------------------------------------------------------

interface DemoCustomer {
  store: StoreId;
  name: string;
  phone: string;
  city: string;
  instagram?: string;
  tags: string[];
  birthday?: { day: number; month: number };
  notes?: string;
  archived: boolean;
  orderCount: number;
  totalSpent: number; // centavos
  lastOrderDays: number | null;
  avgReorderDays: number | null;
  since: Timestamp;
  reorderProduct: string;
}

const CUSTOMERS: DemoCustomer[] = [
  { store: "vila-velha", name: "Carla Menezes", phone: "(27) 99812-4471", city: "Vila Velha/ES", instagram: "carlamenezes", tags: ["vip"], birthday: { day: 12, month: 3 }, notes: "Prefere shakes sem lactose. Cliente desde 2023.", archived: false, orderCount: 41, totalSpent: 226000, lastOrderDays: 0, avgReorderDays: 6, since: monthDate(3, 2023), reorderProduct: "Shake Ovomaltine" },
  { store: "vila-velha", name: "Mariana Lopes", phone: "(27) 99744-1290", city: "Vila Velha/ES", instagram: "mari.lopes", tags: ["vip"], birthday: { day: 28, month: 7 }, notes: "Vegana. Costuma pedir Hype Drink junto.", archived: false, orderCount: 34, totalSpent: 184000, lastOrderDays: 0, avgReorderDays: 8, since: monthDate(6, 2023), reorderProduct: "Shake da Beleza" },
  { store: "vila-velha", name: "Beatriz Almeida", phone: "(27) 99601-7733", city: "Vila Velha/ES", instagram: "bia.almeida", tags: [], birthday: { day: 5, month: 11 }, archived: false, orderCount: 22, totalSpent: 112000, lastOrderDays: 2, avgReorderDays: 12, since: monthDate(9, 2023), reorderProduct: "Seca Barriga" },
  { store: "passos", name: "Rafael Souza", phone: "(35) 99820-3344", city: "Passos/MG", tags: [], birthday: { day: 19, month: 9 }, notes: "Sem glúten.", archived: false, orderCount: 18, totalSpent: 92000, lastOrderDays: 1, avgReorderDays: 9, since: monthDate(11, 2023), reorderProduct: "Coxinha Proteica" },
  { store: "vila-velha", name: "Luiza Castro", phone: "(27) 99533-8812", city: "Vila Velha/ES", instagram: "lu.castro", tags: [], birthday: { day: 2, month: 1 }, archived: false, orderCount: 15, totalSpent: 69000, lastOrderDays: 5, avgReorderDays: 14, since: monthDate(1, 2024), reorderProduct: "Escondidinho de Frango" },
  { store: "passos", name: "Fernando Dias", phone: "(35) 99410-2299", city: "Passos/MG", tags: [], notes: "Sem lactose. Sumiu depois de mudar de bairro.", archived: true, orderCount: 9, totalSpent: 41000, lastOrderDays: 32, avgReorderDays: 20, since: monthDate(8, 2023), reorderProduct: "Hype Drink" },
  { store: "vila-velha", name: "Patrícia Gomes", phone: "(27) 99277-5610", city: "Vila Velha/ES", instagram: "pati.gomes", tags: [], birthday: { day: 23, month: 6 }, archived: false, orderCount: 3, totalSpent: 13200, lastOrderDays: 7, avgReorderDays: 21, since: monthDate(4, 2024), reorderProduct: "Shake da Beleza" },
  { store: "passos", name: "João Pedro", phone: "(35) 99188-4002", city: "Passos/MG", tags: [], archived: false, orderCount: 2, totalSpent: 7800, lastOrderDays: 3, avgReorderDays: 15, since: monthDate(5, 2024), reorderProduct: "Hype Drink" },
];

// ---------------------------------------------------------------------------
// Orders (design `allOrders`, 2040) — 10 with distinct #NNNN codes.
// The doc id IS the numeric code, so orderCode() (first 4 chars) renders the
// design's #1048…#1039 instead of a repeated "#DEMO".
// `total` is the design's tier-priced total (centavos), stored authoritatively
// (toOrder reads d.total, it never re-derives from items); item unit prices are
// realistic menu prices that sum to it, except batch tiers (Coxinha) whose per-
// unit price isn't an integer — there the stored total is the tier price.
// ---------------------------------------------------------------------------

interface DemoOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number; // centavos
}

interface DemoOrder {
  code: string; // "1048" — also the doc id
  store: StoreId;
  customerName: string;
  channel: "instagram" | "whatsapp" | "loja";
  status: "novo" | "preparando" | "entrega" | "concluido" | "cancelado";
  items: DemoOrderItem[];
  total: number; // centavos (authoritative)
  paid: boolean;
  payMethod: "pix" | "cartao" | "dinheiro" | null;
  minutesAgo: number;
}

const ORDERS: DemoOrder[] = [
  { code: "1048", store: "vila-velha", customerName: "Mariana Lopes", channel: "instagram", status: "preparando", total: 7200, paid: false, payMethod: null, minutesAgo: 6, items: [ { productId: "shake-shake-da-beleza", name: "Shake da Beleza", qty: 1, unitPrice: 4400 }, { productId: "bebida-hype-drink", name: "Hype Drink", qty: 1, unitPrice: 2800 } ] },
  { code: "1047", store: "passos", customerName: "Rafael Souza", channel: "whatsapp", status: "novo", total: 3700, paid: false, payMethod: null, minutesAgo: 12, items: [ { productId: "lanche-coxinha-proteica", name: "Coxinha Proteica", qty: 3, unitPrice: 1233 } ] },
  { code: "1046", store: "vila-velha", customerName: "Beatriz Almeida", channel: "loja", status: "concluido", total: 6100, paid: true, payMethod: "pix", minutesAgo: 20, items: [ { productId: "salgado-pizza-proteica", name: "Pizza Proteica", qty: 1, unitPrice: 3300 }, { productId: "bebida-hype-drink", name: "Hype Drink", qty: 1, unitPrice: 2800 } ] },
  { code: "1045", store: "vila-velha", customerName: "Carla Menezes", channel: "whatsapp", status: "entrega", total: 8200, paid: true, payMethod: "pix", minutesAgo: 34, items: [ { productId: "shake-ovomaltine", name: "Shake Ovomaltine", qty: 2, unitPrice: 4100 } ] },
  { code: "1044", store: "passos", customerName: "João Pedro", channel: "instagram", status: "preparando", total: 5600, paid: false, payMethod: null, minutesAgo: 41, items: [ { productId: "bebida-hype-drink", name: "Hype Drink", qty: 2, unitPrice: 2800 } ] },
  { code: "1043", store: "vila-velha", customerName: "Luiza Castro", channel: "instagram", status: "concluido", total: 5500, paid: true, payMethod: "cartao", minutesAgo: 60, items: [ { productId: "salgado-pizza-de-frango", name: "Pizza de Frango", qty: 1, unitPrice: 3600 }, { productId: "bebida-seca-barriga", name: "Seca Barriga", qty: 1, unitPrice: 1900 } ] },
  { code: "1042", store: "passos", customerName: "Fernando Dias", channel: "loja", status: "concluido", total: 2200, paid: true, payMethod: "dinheiro", minutesAgo: 65, items: [ { productId: "bebida-colageno-drink", name: "Colágeno Drink", qty: 1, unitPrice: 2200 } ] },
  { code: "1041", store: "vila-velha", customerName: "Patrícia Gomes", channel: "whatsapp", status: "cancelado", total: 3600, paid: false, payMethod: null, minutesAgo: 120, items: [ { productId: "salgado-escondidinho-de-frango", name: "Escondidinho de Frango", qty: 1, unitPrice: 3600 } ] },
  { code: "1040", store: "passos", customerName: "Tiago Ramos", channel: "instagram", status: "concluido", total: 7400, paid: false, payMethod: null, minutesAgo: 125, items: [ { productId: "lanche-coxinha-proteica", name: "Coxinha Proteica", qty: 6, unitPrice: 1233 } ] },
  { code: "1039", store: "vila-velha", customerName: "Aline Ferreira", channel: "whatsapp", status: "concluido", total: 6400, paid: true, payMethod: "pix", minutesAgo: 180, items: [ { productId: "shake-frutas-vermelhas", name: "Shake Frutas Vermelhas", qty: 1, unitPrice: 3600 }, { productId: "bebida-hype-drink", name: "Hype Drink", qty: 1, unitPrice: 2800 } ] },
];

// Recurring / manual finance rows per store. Categories are restricted to
// FINANCE_CATEGORIES (vendas/compras/salarios/aluguel/marketing/outros).
interface DemoFinance {
  slug: string;
  label: string;
  category: "vendas" | "compras" | "salarios" | "aluguel" | "marketing" | "outros";
  amount: number; // centavos
  direction: "in" | "out";
  days: number;
}

const MANUAL_FINANCE: DemoFinance[] = [
  { slug: "compra-insumos", label: "Compra de insumos Herbalife", category: "compras", amount: 128000, direction: "out", days: 8 },
  { slug: "folha-salarios", label: "Folha de pagamento da equipe", category: "salarios", amount: 340000, direction: "out", days: 5 },
  { slug: "aluguel", label: "Aluguel do ponto", category: "aluguel", amount: 120000, direction: "out", days: 5 },
  { slug: "marketing", label: "Tráfego pago · Instagram/Meta", category: "marketing", amount: 45000, direction: "out", days: 10 },
  { slug: "venda-balcao", label: "Venda avulsa no balcão", category: "vendas", amount: 5400, direction: "in", days: 1 },
];

// Which menu item each insumo is typically consumed for (design seedHist ref map).
const CONSUMO_REF: Record<string, string> = {
  "Shake Herbalife Baunilha": "Shake Frutas Vermelhas",
  "Pó de Proteína (PDM)": "Waffle Proteico",
  "Nutrisoup Creme Verde-Frango": "Pizza Proteica",
  "Fiber Concentrate": "Seca Barriga",
  "Protein Crunch": "Shake Ovomaltine",
  "Herbal Concentrate": "Hype Drink",
  "Beauty Drink Colágeno": "Shake da Beleza",
  "Kit Kat Proteico": "Shake Bombom Serenata",
  "Leite em pó (Ninho)": "Shake Frutas Vermelhas",
  "Morango": "Shake Tradicional Danoninho",
};

/**
 * Demo-only movement history for stock items, so the detail drawer's
 * reason-colored timeline (ENTRADA/VENDA/CONSUMO/AJUSTE) is populated for
 * visual review. Writes movement docs directly (no ledger recompute) — the
 * live sealed/open counts stay as seeded by importCatalog.
 */
async function seedStockHistory(
  store: FirebaseFirestore.DocumentReference,
  orders: DemoOrder[],
) {
  const refOrderCode = orders.find((o) => o.paid)?.code ?? orders[0]?.code;
  const snap = await store.collection("stockItems").get();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.tracked) continue;
    const movs = doc.ref.collection("movements");
    // Clear any prior demo history so re-runs stay idempotent.
    const prior = await movs.get();
    for (const m of prior.docs) await m.ref.delete();

    const pkgSize: number = d.pkgSize ?? 1;
    const cost: number | undefined = d.cost;
    const continuo: boolean = d.continuousUse ?? false;
    const resellable: boolean = d.resellable ?? false;
    const ref = CONSUMO_REF[d.name] ?? "Produção";

    // 1) Opening purchase (green "Compra").
    await movs.doc().set({
      type: "entrada",
      qty: (d.sealed ?? 0) + 2,
      byPackage: true,
      price: cost ?? null,
      reason: "ENTRADA",
      refOrder: null,
      refItem: null,
      by: "joao@daher.dev",
      at: daysAgo(8),
    });

    // 2) A sale (VENDA, blue) for resellable items, else consumption (CONSUMO, purple).
    if (resellable && refOrderCode) {
      await movs.doc().set({
        type: "saida",
        qty: 2,
        byPackage: false,
        price: null,
        reason: "VENDA",
        refOrder: refOrderCode,
        refItem: null,
        by: "joao@daher.dev",
        at: daysAgo(3),
      });
    } else {
      await movs.doc().set({
        type: "saida",
        qty: continuo ? Math.max(5, Math.round(pkgSize * 0.05)) : 2,
        byPackage: false,
        price: null,
        reason: "CONSUMO",
        refOrder: null,
        refItem: ref,
        by: "joao@daher.dev",
        at: daysAgo(4),
      });
    }

    // 3) A stock-count adjustment (AJUSTE, grey).
    await movs.doc().set({
      type: "saida",
      qty: 1,
      byPackage: false,
      price: null,
      reason: "AJUSTE",
      refOrder: null,
      refItem: "Contagem",
      by: "joao@daher.dev",
      at: daysAgo(1),
    });
  }
}

async function seedStore(db: Firestore, storeId: StoreId) {
  const store = db.collection("stores").doc(storeId);
  const customers = CUSTOMERS.filter((c) => c.store === storeId);
  const orders = ORDERS.filter((o) => o.store === storeId);

  // Index customers by name so orders can link to a real customer doc.
  const idByName = new Map(customers.map((c) => [c.name, slug(c.name)]));

  for (const c of customers) {
    await store.collection("customers").doc(slug(c.name)).set({
      name: c.name,
      nameLower: c.name.toLowerCase(),
      phone: c.phone,
      city: c.city,
      instagram: c.instagram ?? null,
      tags: c.tags,
      birthday: c.birthday ?? null,
      notes: c.notes ?? null,
      since: c.since,
      archived: c.archived,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      lastOrderAt: c.lastOrderDays == null ? null : daysAgo(c.lastOrderDays),
      avgReorderDays: c.avgReorderDays,
      reorderProduct: c.reorderProduct,
    });
  }

  for (const o of orders) {
    const ref = store.collection("orders").doc(o.code);
    const when = minutesAgo(o.minutesAgo);
    const customerId = idByName.get(o.customerName) ?? null;
    await ref.set({
      customerId,
      customerName: o.customerName,
      channel: o.channel,
      items: o.items,
      total: o.total,
      status: o.status,
      paid: o.paid,
      payMethod: o.paid ? o.payMethod : null,
      createdAt: when,
      updatedAt: when,
    });
    // Mirror paid orders into finance (matches the app's order-{id} ledger doc).
    if (o.paid) {
      await store.collection("finance").doc(`order-${o.code}`).set({
        label: `Pedido #${orderCode(o.code)} · ${o.customerName}`,
        category: "vendas",
        amount: o.total,
        direction: "in",
        source: "order",
        orderId: o.code,
        payMethod: o.payMethod,
        date: when,
      });
    }
  }

  for (const t of MANUAL_FINANCE) {
    await store.collection("finance").doc(`demo-${t.slug}`).set({
      label: t.label,
      category: t.category,
      amount: t.amount,
      direction: t.direction,
      source: "manual",
      date: daysAgo(t.days),
    });
  }

  await seedStockHistory(store, orders);

  const paid = orders.filter((o) => o.paid).length;
  console.log(
    `Demo seed ok em ${storeId}: ${customers.length} clientes, ${orders.length} pedidos (${paid} pagos), ${MANUAL_FINANCE.length} lançamentos manuais`,
  );
}

async function main() {
  process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT });
  const db: Firestore = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  for (const storeId of targetStores) {
    await seedStore(db, storeId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
