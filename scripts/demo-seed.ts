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
import { refreshStoreSummary } from "./lib/summary";

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
  { store: "passos", name: "Tiago Ramos", phone: "(35) 99356-7781", city: "Passos/MG", instagram: "tiago.ramos", tags: [], birthday: { day: 14, month: 10 }, archived: false, orderCount: 12, totalSpent: 58000, lastOrderDays: 2, avgReorderDays: 11, since: monthDate(10, 2023), reorderProduct: "Coxinha Proteica" },
  { store: "vila-velha", name: "Aline Ferreira", phone: "(27) 99465-2098", city: "Vila Velha/ES", instagram: "aline.ferreira", tags: ["vip"], birthday: { day: 8, month: 4 }, notes: "Gosta de shakes de frutas vermelhas.", archived: false, orderCount: 27, totalSpent: 149000, lastOrderDays: 3, avgReorderDays: 7, since: monthDate(7, 2023), reorderProduct: "Shake Frutas Vermelhas" },
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

interface DemoOrderDiscount {
  kind: "flat" | "percent" | "free";
  value: number; // centavos (flat), 1-100 (percent), always 0 (free)
  amount: number; // centavos, server-computed in the real app — precomputed here to match
  reason?: "cortesia" | "consumo-interno" | "combinado" | "erro-preparo";
}

interface DemoOrder {
  code: string; // "1048" — also the doc id
  store: StoreId;
  customerName: string;
  channel: "instagram" | "whatsapp" | "loja" | "interno";
  status: "novo" | "preparando" | "entrega" | "concluido" | "cancelado";
  items: DemoOrderItem[];
  total: number; // centavos (authoritative, post-discount)
  paid: boolean;
  payMethod: "pix" | "cartao" | "dinheiro" | null;
  minutesAgo: number;
  /** Overrides `minutesAgo` when set — for the backdated cross-month demo order. */
  daysAgo?: number;
  /** Manual order-level discount (Parte A) — e.g. the "nada a cobrar" demo. */
  discount?: DemoOrderDiscount;
  /** Free-text order note (drawer-only, never shown in list rows). */
  notes?: string;
}

const ORDERS: DemoOrder[] = [
  // "Interno" channel + "Grátis" discount (reason consumo-interno) → total 0,
  // demonstrating "nada a cobrar" end to end (paid:false, payMethod:null forced
  // by the zero total). Notes is drawer-only, never shown in the Pedidos rows.
  { code: "1049", store: "vila-velha", customerName: "Aline Ferreira", channel: "interno", status: "concluido", total: 0, paid: false, payMethod: null, minutesAgo: 3, discount: { kind: "free", value: 0, amount: 3600, reason: "consumo-interno" }, notes: "Lote de teste do fornecedor — consumo interno da equipe, sem cobrança.", items: [ { productId: "shake-frutas-vermelhas", name: "Shake Frutas Vermelhas", qty: 1, unitPrice: 3600 } ] },
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
  // Backdated ~2 months (within the 12-month cap) — demonstrates cross-month
  // bucketing in both the summary (byMonth) and the Financeiro mirror, whose
  // `date` must land in the SAME month as this order's createdAt.
  { code: "1038", store: "passos", customerName: "Tiago Ramos", channel: "whatsapp", status: "concluido", total: 3700, paid: true, payMethod: "pix", minutesAgo: 0, daysAgo: 61, items: [ { productId: "lanche-coxinha-proteica", name: "Coxinha Proteica", qty: 3, unitPrice: 1233 } ] },
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

// ---------------------------------------------------------------------------
// Cartelas (design Mock Cartelas.dc.html) — vila-velha only, matching the
// mock's example roster (#C007, #C010, #C011, #C012) for paidUses/totalUses/
// unitValue/consumed-count. Doc ids are the literal 4-char codes so
// cartelaCode(id) reproduces them exactly, mirroring the ORDERS trick above.
//
// The mock's own "#C010" row is Rafael Souza, a Passos customer — cartelas
// are store-scoped (customerId must resolve within this store), so that row
// is reassigned to Carla Menezes (vila-velha) here, keeping every numeric
// value (paidUses/unitValue/purchasedDaysAgo) identical to the mock.
//
// purchasedAt/use timestamps use small relative-day offsets (not the mock's
// literal 2026-07/08 calendar dates) so "Recebido no mês"/"Usos resgatados no
// mês" land in whatever month this script actually runs in — unlike the rest
// of this roster, those two stat cards won't match the mock's frozen R$
// figures pixel-for-pixel, only its shape (3 active cartelas, one exhausted).
// ---------------------------------------------------------------------------

type DemoCartelaUse =
  | { kind: "order"; orderCode: string; productName: string; daysAgo: number }
  | {
      kind: "manual";
      reason: "NAO_REGISTRADO" | "CORTESIA" | "CORRECAO";
      note?: string;
      by: string;
      daysAgo: number;
    };

interface DemoCartela {
  code: string; // "C012" — also the doc id
  customerName: string;
  paidUses: number;
  unitValue: number; // centavos
  purchasedDaysAgo: number;
  /** Chronological, oldest first — index 0 is always the brinde. */
  uses: DemoCartelaUse[];
  status: "ativa" | "esgotada";
}

const CARTELAS: DemoCartela[] = [
  // Active, mostly untouched — 6 remaining paid uses.
  {
    code: "C012",
    customerName: "Mariana Lopes",
    paidUses: 10,
    unitValue: 3000,
    purchasedDaysAgo: 4,
    uses: [
      { kind: "order", orderCode: "4066", productName: "Shake da Beleza", daysAgo: 4 }, // brinde
      { kind: "order", orderCode: "4102", productName: "Shake Ovomaltine", daysAgo: 3 },
      { kind: "order", orderCode: "4187", productName: "Shake da Beleza", daysAgo: 1 },
      { kind: "order", orderCode: "4187", productName: "Shake Ovomaltine", daysAgo: 1 },
      { kind: "order", orderCode: "4187", productName: "Shake Bombom Serenata", daysAgo: 1 },
      // Mirrors docs/design/Mock Cartelas.dc.html frames 2a/3a verbatim — this
      // is the exact "Ajuste manual" history entry + "5 usos restantes" example.
      {
        kind: "manual",
        reason: "NAO_REGISTRADO",
        note: "Cliente resgatou na loja sem registro no caixa",
        by: "Camila",
        daysAgo: 0,
      },
    ],
    status: "ativa",
  },
  // Active, over halfway consumed — 4 remaining paid uses.
  {
    code: "C011",
    customerName: "Beatriz Almeida",
    paidUses: 10,
    unitValue: 2200,
    purchasedDaysAgo: 10,
    uses: [
      { kind: "order", orderCode: "4058", productName: "Coxinha Proteica", daysAgo: 10 }, // brinde
      { kind: "order", orderCode: "4071", productName: "Coxinha Proteica", daysAgo: 8 },
      { kind: "order", orderCode: "4071", productName: "Coxinha Proteica", daysAgo: 8 },
      { kind: "order", orderCode: "4098", productName: "Coxinha Proteica", daysAgo: 5 },
      { kind: "order", orderCode: "4098", productName: "Coxinha Proteica", daysAgo: 5 },
      // Mirrors frame 1a's list-row example (dashed dot mid-sequence).
      { kind: "manual", reason: "CORTESIA", by: "Camila", daysAgo: 3 },
      { kind: "order", orderCode: "4140", productName: "Coxinha Proteica", daysAgo: 2 },
      { kind: "order", orderCode: "4140", productName: "Coxinha Proteica", daysAgo: 2 },
    ],
    status: "ativa",
  },
  // Active, untouched — bought recently, brinde not even claimed yet.
  {
    code: "C010",
    customerName: "Carla Menezes",
    paidUses: 6,
    unitValue: 3600,
    purchasedDaysAgo: 6,
    uses: [],
    status: "ativa",
  },
  // Exhausted — dimmed "Esgotada" row, hidden from the balance/circulação stat.
  {
    code: "C007",
    customerName: "Luiza Castro",
    paidUses: 10,
    unitValue: 1500,
    purchasedDaysAgo: 95,
    uses: [
      { kind: "order", orderCode: "3312", productName: "Escondidinho de Frango", daysAgo: 95 }, // brinde
      { kind: "order", orderCode: "3350", productName: "Escondidinho de Frango", daysAgo: 85 },
      { kind: "order", orderCode: "3390", productName: "Escondidinho de Frango", daysAgo: 76 },
      { kind: "order", orderCode: "3430", productName: "Escondidinho de Frango", daysAgo: 67 },
      { kind: "order", orderCode: "3470", productName: "Escondidinho de Frango", daysAgo: 58 },
      { kind: "order", orderCode: "3512", productName: "Escondidinho de Frango", daysAgo: 49 },
      { kind: "order", orderCode: "3560", productName: "Escondidinho de Frango", daysAgo: 40 },
      { kind: "order", orderCode: "3610", productName: "Escondidinho de Frango", daysAgo: 31 },
      { kind: "order", orderCode: "3670", productName: "Escondidinho de Frango", daysAgo: 22 },
      { kind: "order", orderCode: "3740", productName: "Escondidinho de Frango", daysAgo: 13 },
      { kind: "order", orderCode: "3820", productName: "Escondidinho de Frango", daysAgo: 4 },
    ],
    status: "esgotada",
  },
];

async function seedCartelas(
  store: FirebaseFirestore.DocumentReference,
  customers: DemoCustomer[],
) {
  const idByName = new Map(customers.map((c) => [c.name, slug(c.name)]));

  for (const c of CARTELAS) {
    const customerId = idByName.get(c.customerName) ?? null;
    if (!customerId) continue;
    const totalUses = c.paidUses + 1;
    const purchasedAt = daysAgo(c.purchasedDaysAgo);
    // Brinde-vs-paid is derived from array position (index 0 = brinde), not
    // stored per-use — see lib/cartelas' punchStates()/usesByOrder(). `at` is
    // an ISO string here (not a Timestamp) to match the real write path in
    // data/cartelas.ts (`uses.push({ ..., at: nowIso })`) — CartelaUse.at is
    // typed as `string`, and toCartela() reads it back verbatim (unlike
    // purchasedAt/createdAt/updatedAt, it does no Timestamp→ISO conversion),
    // so a raw Timestamp here breaks RSC serialization of the whole cartela
    // the moment the Pedidos order drawer fetches it client-side.
    const uses = c.uses.map((u) =>
      u.kind === "manual"
        ? {
            kind: "manual" as const,
            reason: u.reason,
            note: u.note,
            by: u.by,
            at: daysAgo(u.daysAgo).toDate().toISOString(),
          }
        : {
            kind: "order" as const,
            orderId: `demo-order-${u.orderCode}`,
            orderCode: u.orderCode,
            productName: u.productName,
            at: daysAgo(u.daysAgo).toDate().toISOString(),
          },
    );

    await store.collection("cartelas").doc(c.code).set({
      customerId,
      customerName: c.customerName,
      paidUses: c.paidUses,
      totalUses,
      unitValue: c.unitValue,
      amount: c.paidUses * c.unitValue,
      uses,
      status: c.status,
      soldOnOrderId: `demo-order-${c.code}`,
      purchasedAt,
      createdAt: purchasedAt,
      updatedAt: purchasedAt,
    });
  }
}

// ---------------------------------------------------------------------------
// Shakes (Mock Shakes.dc.html) — vila-velha only, matching the mock's numbers.
// Reuses existing seeded HBL stockItems so insumo links resolve; "Copo"/
// "Tampa" are new minimal untracked stockItems since the seeded catalog has
// no packaging SKUs (café insumos only).
// ---------------------------------------------------------------------------

interface DemoInsumoRef {
  stockItemId: string;
  name: string;
  qty: number;
  unit: string;
}

const SHAKE_FLAVORS: {
  slug: string;
  name: string;
  price: number;
  recipe: DemoInsumoRef[];
}[] = [
  {
    slug: "frutas-amarelas",
    name: "Frutas Amarelas",
    price: 3200,
    recipe: [
      { stockItemId: "shake-todos-os-sabores", name: "Shake Herbalife Baunilha", qty: 26, unit: "g" },
      { stockItemId: "leite-em-po-ninho", name: "Leite em pó (Ninho)", qty: 15, unit: "g" },
    ],
  },
  {
    slug: "ovomaltine",
    name: "Ovomaltine",
    price: 3600,
    recipe: [
      { stockItemId: "shake-todos-os-sabores", name: "Shake Herbalife Baunilha", qty: 26, unit: "g" },
      { stockItemId: "leite-em-po-ninho", name: "Leite em pó (Ninho)", qty: 15, unit: "g" },
    ],
  },
  {
    slug: "chocolate",
    name: "Chocolate",
    price: 3000,
    recipe: [{ stockItemId: "shake-todos-os-sabores", name: "Shake Herbalife Baunilha", qty: 26, unit: "g" }],
  },
];

const SHAKE_BASES: {
  slug: string;
  name: string;
  insumo: DemoInsumoRef;
  price: number;
}[] = [
  { slug: "leite", name: "Leite", insumo: { stockItemId: "leite-em-po-ninho", name: "Leite em pó (Ninho)", qty: 300, unit: "g" }, price: 0 },
  { slug: "nutrev", name: "NutreV", insumo: { stockItemId: "nutrev-672g-21-porcoes", name: "NutreV 672g", qty: 2, unit: "un" }, price: 0 },
  { slug: "leite-nutrev", name: "Leite + NutreV", insumo: { stockItemId: "leite-em-po-ninho", name: "Leite em pó (Ninho)", qty: 150, unit: "g" }, price: 200 },
];

const SHAKE_RIMS: {
  slug: string;
  name: string;
  insumo: DemoInsumoRef;
  tiers: { qty: number; price: number }[];
}[] = [
  { slug: "crunch", name: "Crunch", insumo: { stockItemId: "protein-crunch", name: "Protein Crunch", qty: 15, unit: "g" }, tiers: [{ qty: 1, price: 600 }, { qty: 2, price: 1000 }] },
  { slug: "kit-kat", name: "Kit Kat", insumo: { stockItemId: "kit-kat-proteico", name: "Kit Kat Proteico", qty: 1, unit: "un" }, tiers: [{ qty: 1, price: 600 }, { qty: 2, price: 1000 }] },
];

const SHAKE_MIXINS: {
  slug: string;
  name: string;
  insumo: DemoInsumoRef;
  tiers: { qty: number; price: number }[];
}[] = [
  { slug: "fibra-ativa", name: "Fibra Ativa", insumo: { stockItemId: "fiber-concentrate-manga-uva-limao-30-cs", name: "Fiber Concentrate", qty: 5, unit: "g" }, tiers: [{ qty: 1, price: 500 }, { qty: 2, price: 800 }] },
  { slug: "whey-extra", name: "Whey extra", insumo: { stockItemId: "whey-protein-3w", name: "Whey Protein 3W", qty: 1, unit: "un" }, tiers: [{ qty: 1, price: 700 }, { qty: 2, price: 1200 }] },
  { slug: "colageno", name: "Colágeno", insumo: { stockItemId: "beauty-drink-colageno-frutas-vermelhas", name: "Beauty Drink Colágeno", qty: 1, unit: "sache" }, tiers: [{ qty: 1, price: 800 }, { qty: 2, price: 1400 }] },
];

const SHAKE_UTENSILS: { slug: string; name: string; insumo: DemoInsumoRef; defaultIncluded: boolean }[] = [
  { slug: "copo", name: "Copo 500 ml", insumo: { stockItemId: "demo-copo-500ml", name: "Copo 500 ml", qty: 1, unit: "un" }, defaultIncluded: true },
  { slug: "tampa", name: "Tampa", insumo: { stockItemId: "demo-tampa-copo", name: "Tampa", qty: 1, unit: "un" }, defaultIncluded: true },
];

// Brindes — real "bebidas" Products from scripts/data/menu-catalog.json (doc
// id = productId, a pure join; the shakeBrindes doc itself only caches the
// name as a fallback label). Reuses productIds already imported by
// importCatalog and already referenced by DEMO_ORDERS above.
const SHAKE_BRINDES: { productId: string; name: string }[] = [
  { productId: "bebida-sunset", name: "Sunset" },
  { productId: "bebida-refrigerante-saudavel", name: "Refrigerante Saudável" },
  { productId: "bebida-colageno-drink", name: "Colágeno Drink" },
];

async function seedShakeCatalog(store: FirebaseFirestore.DocumentReference) {
  const now = Timestamp.now();

  // New minimal untracked stockItems for the utensílios (no packaging SKUs
  // exist in the seeded HBL catalog — these are demo-only, "un" → medido).
  for (const [id, name] of [
    ["demo-copo-500ml", "Copo 500 ml"],
    ["demo-tampa-copo", "Tampa"],
  ]) {
    await store.collection("stockItems").doc(id).set({
      name,
      category: "secos",
      unit: "un",
      tracked: false,
      sealed: 0,
      open: 200,
      qty: 200,
      continuousUse: false,
      consumptionMode: "medido",
      openPkg: false,
      usos: 0,
      resellable: false,
      reorderAt: 20,
      lowStock: false,
      archived: false,
      updatedAt: now,
    });
  }

  for (const f of SHAKE_FLAVORS) {
    await store.collection("shakeFlavors").doc(f.slug).set({
      name: f.name,
      price: f.price,
      recipe: f.recipe,
      archived: false,
      createdAt: now,
    });
  }
  for (const b of SHAKE_BASES) {
    await store.collection("shakeBases").doc(b.slug).set({
      name: b.name,
      insumo: b.insumo,
      price: b.price,
      archived: false,
      createdAt: now,
    });
  }
  for (const r of SHAKE_RIMS) {
    await store.collection("shakeRims").doc(r.slug).set({
      name: r.name,
      insumo: r.insumo,
      tiers: r.tiers,
      archived: false,
      createdAt: now,
    });
  }
  for (const m of SHAKE_MIXINS) {
    await store.collection("shakeMixins").doc(m.slug).set({
      name: m.name,
      insumo: m.insumo,
      tiers: m.tiers,
      archived: false,
      createdAt: now,
    });
  }
  for (const u of SHAKE_UTENSILS) {
    await store.collection("shakeUtensils").doc(u.slug).set({
      name: u.name,
      insumo: u.insumo,
      defaultIncluded: u.defaultIncluded,
      archived: false,
      createdAt: now,
    });
  }
  for (const b of SHAKE_BRINDES) {
    await store.collection("shakeBrindes").doc(b.productId).set({
      name: b.name,
      archived: false,
      createdAt: now,
    });
  }

  console.log(
    `  shakes: ${SHAKE_FLAVORS.length} sabores, ${SHAKE_BASES.length} bases, ${SHAKE_RIMS.length} bordas, ${SHAKE_MIXINS.length} adicionais, ${SHAKE_BRINDES.length} brindes, ${SHAKE_UTENSILS.length} utensílios`,
  );
}

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
  // Mirror a few opening purchases into Financeiro "compras" saídas so the
  // movimentações + saídas totals look realistic (matches the app's event-driven
  // stock→finance auto-expense; deterministic id per item stays idempotent).
  let mirroredPurchases = 0;
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

    // 1) Opening purchase (green "Compra"). Deterministic movement id so the
    // finance mirror below (stock-<movementId>) is stable across re-seeds.
    const openQty = (d.sealed ?? 0) + 2;
    const openMovId = `open-${doc.id}`;
    const openAt = daysAgo(8);
    await movs.doc(openMovId).set({
      type: "entrada",
      qty: openQty,
      byPackage: true,
      price: cost ?? null,
      reason: "ENTRADA",
      refOrder: null,
      refItem: null,
      by: "joao@daher.dev",
      at: openAt,
    });
    if (cost && cost > 0 && mirroredPurchases < 3) {
      await store.collection("finance").doc(`stock-${openMovId}`).set({
        label: `Compra · ${d.name}`,
        category: "compras",
        amount: cost * openQty,
        direction: "out",
        source: "stock",
        date: openAt,
      });
      mirroredPurchases += 1;
    }

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
    const when = o.daysAgo != null ? daysAgo(o.daysAgo) : minutesAgo(o.minutesAgo);
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
      discount: o.discount ?? null,
      notes: o.notes ?? null,
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

  // Cartelas/Shakes demo data lives only in vila-velha (matches the mock's
  // example roster — no need to duplicate catalogs across stores).
  if (storeId === "vila-velha") {
    await seedCartelas(store, customers);
    await seedShakeCatalog(store);
  }

  // Backfill the pre-computed summary now that all orders/finance/stock docs for
  // this store exist (matches what the app maintains incrementally on writes).
  await refreshStoreSummary(db, storeId);

  const paid = orders.filter((o) => o.paid).length;
  const cartelaNote = storeId === "vila-velha" ? `, ${CARTELAS.length} cartelas` : "";
  console.log(
    `Demo seed ok em ${storeId}: ${customers.length} clientes, ${orders.length} pedidos (${paid} pagos), ${MANUAL_FINANCE.length} lançamentos manuais${cartelaNote}`,
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
