/**
 * READ-ONLY Financeiro integrity audit. Writes NOTHING.
 *
 *   npx tsx scripts/audit-finance.ts [--store=passos]
 *
 * Firestore has no joins or constraints, and Financeiro reads three
 * denormalized views of the same money — so this checks they still agree, per
 * store and per competência month (store timezone):
 *   1. finance docs  — the Movimentações list and the month hero
 *   2. meta/summary  — months[mk].in/out, feeds the Evolução chart / dashboard
 *   3. a fresh recompute of the whole summary from the raw collections
 * plus the mirror invariants:
 *   - `order-{orderId}` exists  <=>  order is paid and not cancelled, and
 *     amount === order.total (itself === orderMoney(items, discount).total)
 *   - revendaAmount === revendaShare(items, total)
 *   - every finance category exists in settings/finance (or is the legacy
 *     "vendas" key on order mirrors)
 *   - legacy `stock-{movementId}` rows (see migrate-legacy-stock-expenses.ts)
 *     are reported as WARN: they're locked in the UI but no longer maintained.
 *
 * Exit code 1 when any hard problem is found (drift, broken mirror, bad doc).
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import {
  computeSummaryFrom,
  pruneMonths,
  type MonthAgg,
  type SummaryData,
} from "../src/lib/summary-core";
import { orderMoney, revendaShare } from "../src/lib/order-money";
import { monthKey } from "../src/lib/timezone";

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));
const onlyStore = process.argv.find((a) => a.startsWith("--store="))?.slice(8);

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mkOf = (t: Timestamp | undefined) => (t ? monthKey(t.toDate()) : "(sem data)");
const LEGACY_VENDAS = "vendas";

type Bucket = { in: number; out: number };
function add(m: Record<string, Bucket>, k: string, dir: string, amt: number) {
  const b = (m[k] ??= { in: 0, out: 0 });
  if (dir === "in") b.in += amt;
  else if (dir === "out") b.out += amt;
}

let problems = 0;
let warnings = 0;
const problem = (msg: string) => {
  problems++;
  console.log(`  !! ${msg}`);
};
const warn = (msg: string) => {
  warnings++;
  console.log(`  ~~ ${msg}`);
};

async function auditStore(storeId: string) {
  const store = db.collection("stores").doc(storeId);
  console.log(`\n${"=".repeat(78)}\nSTORE ${storeId}\n${"=".repeat(78)}`);

  const [ordersSnap, financeSnap, stockSnap, customersSnap, summarySnap, settingsSnap] = await Promise.all([
    store.collection("orders").get(),
    store.collection("finance").get(),
    store.collection("stockItems").get(),
    store.collection("customers").get(),
    store.collection("meta").doc("summary").get(),
    store.collection("settings").doc("finance").get(),
  ]);
  console.log(
    `orders=${ordersSnap.size} finance=${financeSnap.size} stockItems=${stockSnap.size} customers=${customersSnap.size} summaryDoc=${summarySnap.exists}`,
  );

  // ---- 1. finance docs: shape, categories, totals -------------------------
  const settingsCats = new Set<string>(
    ((settingsSnap.data()?.categories ?? []) as { id: string }[]).map((c) => c.id),
  );
  const bySource: Record<string, { n: number; in: number; out: number }> = {};
  const fromDocs: Record<string, Bucket> = {};
  const outBySource: Record<string, Record<string, number>> = {};
  for (const doc of financeSnap.docs) {
    const d = doc.data();
    const src: string = d.source ?? "(none)";
    const amt = d.amount;
    if (!Number.isInteger(amt) || amt <= 0) problem(`${doc.id}: amount=${amt}`);
    if (d.direction !== "in" && d.direction !== "out") problem(`${doc.id}: direction=${d.direction}`);
    if (!d.date) problem(`${doc.id}: sem data`);
    if (!["order", "manual", "stock"].includes(src)) problem(`${doc.id}: source=${src}`);
    if (src === "order" && d.direction !== "in") problem(`${doc.id}: espelho de pedido com direction=${d.direction}`);
    const known = settingsCats.has(d.category) || (src === "order" && d.category === LEGACY_VENDAS);
    if (!known) problem(`${doc.id}: categoria "${d.category}" não existe em settings/finance`);
    const s = (bySource[src] ??= { n: 0, in: 0, out: 0 });
    s.n++;
    if (d.direction === "in") s.in += amt ?? 0;
    else s.out += amt ?? 0;
    add(fromDocs, mkOf(d.date), d.direction, amt ?? 0);
    if (d.direction === "out") ((outBySource[mkOf(d.date)] ??= {})[src] = (outBySource[mkOf(d.date)]?.[src] ?? 0) + (amt ?? 0));
  }
  console.log("\n-- finance docs por origem --");
  for (const [src, s] of Object.entries(bySource))
    console.log(`  ${src.padEnd(8)} n=${String(s.n).padStart(4)}  in=${brl(s.in).padStart(14)}  out=${brl(s.out).padStart(14)}`);

  // ---- 2. docs vs stored summary, per month -------------------------------
  const stored: SummaryData | null = summarySnap.exists ? (summarySnap.data() as unknown as SummaryData) : null;
  if (!stored) problem("meta/summary ausente");
  const months = [...new Set([...Object.keys(fromDocs), ...Object.keys(stored?.months ?? {})])].sort();
  console.log("\n-- entradas/saídas por mês: finance docs vs meta/summary --");
  console.log("  mês       docs.in      docs.out     sum.in       sum.out      saldo(docs)   saídas por origem");
  for (const mk of months) {
    const dd = fromDocs[mk] ?? { in: 0, out: 0 };
    const ss = stored?.months?.[mk] as MonthAgg | undefined;
    const sin = ss?.in ?? 0;
    const sout = ss?.out ?? 0;
    const src = Object.entries(outBySource[mk] ?? {})
      .map(([k, v]) => `${k}:${brl(v)}`)
      .join(" ");
    console.log(
      `  ${mk}  ${brl(dd.in).padStart(11)} ${brl(dd.out).padStart(12)} ${brl(sin).padStart(12)} ${brl(sout).padStart(12)} ${brl(dd.in - dd.out).padStart(13)}   ${src}`,
    );
    if (sin !== dd.in || sout !== dd.out) problem(`${mk}: meta/summary diverge dos finance docs (Δin ${brl(sin - dd.in)}, Δout ${brl(sout - dd.out)})`);
  }

  // ---- 3. stored summary vs full recompute, every field -------------------
  const recomputed = pruneMonths(
    computeSummaryFrom({
      orders: ordersSnap.docs.map((doc) => {
        const d = doc.data();
        return {
          status: d.status,
          total: d.total ?? 0,
          paid: d.paid ?? false,
          customerId: d.customerId ?? null,
          customerName: d.customerName ?? "",
          createdAt: d.createdAt?.toDate() ?? new Date(0),
          channel: d.channel,
          items: d.items ?? [],
        };
      }),
      finance: financeSnap.docs.map((doc) => {
        const d = doc.data();
        return { direction: d.direction, amount: d.amount ?? 0, date: d.date?.toDate() ?? new Date(0) };
      }),
      stock: stockSnap.docs.map((doc) => ({
        lowStock: doc.data().lowStock ?? false,
        archived: doc.data().archived ?? false,
      })),
      customers: customersSnap.docs.map((doc) => ({
        since: doc.data().since?.toDate() ?? new Date(0),
        archived: doc.data().archived ?? false,
      })),
    }),
  );
  console.log("\n-- meta/summary vs recompute completo --");
  if (stored) {
    const before = problems;
    for (const k of ["openOrders", "lowStock", "activeCustomers"] as const)
      if ((stored[k] ?? 0) !== recomputed[k]) problem(`${k}: summary=${stored[k]} recompute=${recomputed[k]}`);
    for (const mk of [...new Set([...Object.keys(stored.months ?? {}), ...Object.keys(recomputed.months)])].sort()) {
      const a = stored.months?.[mk] as MonthAgg | undefined;
      const b = recomputed.months[mk];
      for (const f of ["in", "out", "orderCount", "ticketSum", "unpaidTotal", "unpaidCount", "newCustomers", "novos"] as const) {
        if ((a?.[f] ?? 0) !== (b?.[f] ?? 0)) problem(`${mk}.${f}: summary=${a?.[f] ?? 0} recompute=${b?.[f] ?? 0}`);
      }
      const ac = Object.keys(a?.customers ?? {}).length;
      const bc = Object.keys(b?.customers ?? {}).length;
      if (ac !== bc) problem(`${mk}.customers (distintos): summary=${ac} recompute=${bc}`);
    }
    if (problems === before) console.log("  sem divergências");
  }

  // ---- 4. order mirrors ---------------------------------------------------
  console.log("\n-- espelhos de pedidos --");
  const mirrors = new Map(financeSnap.docs.filter((d) => d.id.startsWith("order-")).map((d) => [d.id, d.data()]));
  const before = problems;
  for (const doc of ordersSnap.docs) {
    const d = doc.data();
    const items = d.items ?? [];
    const discount = d.discount
      ? { kind: d.discount.kind, value: d.discount.value, reason: d.discount.reason }
      : null;
    const expected = orderMoney(items, discount).total;
    if (expected !== (d.total ?? 0)) problem(`pedido ${doc.id}: total=${brl(d.total ?? 0)} mas itens/desconto => ${brl(expected)}`);
    const m = mirrors.get(`order-${doc.id}`);
    const shouldMirror = !!d.paid && d.status !== "cancelado";
    if (shouldMirror && !m) problem(`pedido ${doc.id} pago e ativo SEM espelho (total ${brl(d.total ?? 0)})`);
    else if (!shouldMirror && m) problem(`pedido ${doc.id} (status=${d.status} paid=${!!d.paid}) com espelho órfão de ${brl(m.amount ?? 0)}`);
    else if (shouldMirror && m) {
      if (m.amount !== d.total) problem(`pedido ${doc.id}: espelho ${brl(m.amount ?? 0)} != total ${brl(d.total ?? 0)}`);
      if ((m.revendaAmount ?? 0) !== revendaShare(items, d.total ?? 0)) problem(`pedido ${doc.id}: revendaAmount do espelho diverge`);
    }
    if (d.paid && (d.total ?? 0) === 0) problem(`pedido ${doc.id} pago com total R$ 0`);
  }
  const orderIds = new Set(ordersSnap.docs.map((d) => `order-${d.id}`));
  for (const id of mirrors.keys()) if (!orderIds.has(id)) problem(`espelho ${id} sem pedido`);
  if (problems === before) console.log(`  ${mirrors.size} espelho(s) consistentes com ${ordersSnap.size} pedido(s)`);

  // ---- 5. legacy stock rows -----------------------------------------------
  console.log("\n-- lançamentos legados de estoque (source=stock) --");
  const legacy = financeSnap.docs.filter((d) => d.data().source === "stock");
  if (legacy.length === 0) console.log("  nenhum");
  for (const f of legacy) {
    const d = f.data();
    let movement = "sem stockItemId";
    if (d.stockItemId) {
      const m = await store
        .collection("stockItems")
        .doc(d.stockItemId)
        .collection("movements")
        .doc(f.id.replace(/^stock-/, ""))
        .get();
      if (!m.exists) movement = "movimento NÃO existe mais";
      else {
        const mv = m.data()!;
        const ok = mv.type === "entrada" && mv.price * mv.qty === d.amount;
        movement = ok ? "movimento ok" : `movimento diverge (${mv.type} ${mv.qty}×${mv.price})`;
        if (!ok) problem(`${f.id}: valor ${brl(d.amount)} não bate com o movimento`);
      }
    }
    warn(`${f.id} · ${mkOf(d.date)} · ${brl(d.amount)} · "${d.label}" · ${movement} — travado na UI e não acompanha mais o estoque`);
  }
}

async function main() {
  console.log(
    `Auditoria financeira — SOMENTE LEITURA — alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD (selet-prod)"} — ${new Date().toISOString()}`,
  );
  const stores = onlyStore ? [db.collection("stores").doc(onlyStore)] : await db.collection("stores").listDocuments();
  for (const s of stores) await auditStore(s.id);
  console.log(`\nResultado: ${problems} problema(s), ${warnings} aviso(s).`);
  process.exit(problems > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
