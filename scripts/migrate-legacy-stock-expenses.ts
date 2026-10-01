/**
 * One-off: resolve the legacy stock-purchase expenses left in Financeiro after
 * "Stop mirroring stock purchases into finance" (#15).
 *
 * Before #15, a priced stock ENTRADA wrote a finance row `stock-{movementId}`
 * (source "stock", direction "out") and bumped meta/summary months[mk].out.
 * #15 stopped creating them — but also stopped MANAGING them: editing or
 * deleting the movement no longer touches the row, while the UI still shows it
 * locked ("edite pela entrada de estoque") and deleteManualTx/updateManualTx
 * reject any non-manual row. The rows created before the change are therefore
 * stuck: counted in the month's Saídas, impossible to edit or delete in the app.
 *
 * Modes (pick one with --mode):
 *   convert (default)  source "stock" -> "manual". Balances do NOT change; the
 *                      rows become ordinary "Avulso" lançamentos the team can
 *                      edit/delete from Movimentações. meta/summary untouched.
 *   delete             removes the rows and subtracts them from
 *                      meta/summary.months[mk].out (race-safe FieldValue.increment
 *                      in the same transaction). Balances change: use when the
 *                      purchase is (or will be) entered manually, to avoid
 *                      counting it twice.
 *
 * Other flags:
 *   --store=<id>        only that store (default: every store)
 *   --ids=a,b           only these finance doc ids (default: every source=stock row)
 *   --apply             actually write (default is a dry run that writes nothing)
 *
 *   npx tsx scripts/migrate-legacy-stock-expenses.ts                          # dry run, convert
 *   npx tsx scripts/migrate-legacy-stock-expenses.ts --mode=delete            # dry run, delete
 *   npx tsx scripts/migrate-legacy-stock-expenses.ts --ids=stock-abc --apply  # write
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same convention as the other
 * migrate-* scripts. After --apply it re-reads the store and checks that the
 * finance docs and meta/summary agree per month (in and out).
 */
import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { formatBRL } from "../src/lib/format";
import { monthKey } from "../src/lib/timezone";

type Mode = "convert" | "delete";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const apply = process.argv.includes("--apply");
const mode = (arg("mode") ?? "convert") as Mode;
const onlyStore = arg("store");
const onlyIds = arg("ids")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (mode !== "convert" && mode !== "delete") {
  console.error(`--mode deve ser "convert" ou "delete" (recebido: ${mode}).`);
  process.exit(1);
}

const db: Firestore = getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));

const CONVERTED_NOTE = "Compra de estoque (lançamento automático convertido em avulso)";

interface Row {
  ref: DocumentReference;
  snap: DocumentSnapshot;
  id: string;
  label: string;
  category: string;
  amount: number;
  mk: string;
  movementFound: boolean;
}

/** Collects the stock-sourced finance rows of a store, validated; bad rows are reported and skipped. */
async function collectRows(storeId: string): Promise<Row[]> {
  const store = db.collection("stores").doc(storeId);
  const snap = await store.collection("finance").where("source", "==", "stock").get();
  const rows: Row[] = [];
  for (const doc of snap.docs) {
    if (onlyIds && !onlyIds.includes(doc.id)) continue;
    const d = doc.data();
    if (d.direction !== "out" || !Number.isInteger(d.amount) || d.amount <= 0 || !d.date) {
      console.log(`  !! ignorando ${doc.id}: direction=${d.direction} amount=${d.amount} date=${d.date ? "ok" : "ausente"}`);
      continue;
    }
    let movementFound = false;
    if (d.stockItemId) {
      const mov = await store
        .collection("stockItems")
        .doc(d.stockItemId)
        .collection("movements")
        .doc(doc.id.replace(/^stock-/, ""))
        .get();
      movementFound = mov.exists;
    }
    rows.push({
      ref: doc.ref,
      snap: doc,
      id: doc.id,
      label: d.label ?? "",
      category: d.category ?? "",
      amount: d.amount,
      mk: monthKey((d.date as Timestamp).toDate()),
      movementFound,
    });
  }
  return rows.sort((a, b) => a.mk.localeCompare(b.mk) || a.id.localeCompare(b.id));
}

/** Per-month in/out as stored in the finance docs vs. meta/summary. Returns the mismatching months. */
async function verifyStore(storeId: string): Promise<string[]> {
  const store = db.collection("stores").doc(storeId);
  const [fin, sum] = await Promise.all([
    store.collection("finance").get(),
    store.collection("meta").doc("summary").get(),
  ]);
  const docs: Record<string, { in: number; out: number }> = {};
  for (const f of fin.docs) {
    const d = f.data();
    if (!d.date) continue;
    const b = (docs[monthKey((d.date as Timestamp).toDate())] ??= { in: 0, out: 0 });
    if (d.direction === "in") b.in += d.amount ?? 0;
    else b.out += d.amount ?? 0;
  }
  const months = (sum.data()?.months ?? {}) as Record<string, { in?: number; out?: number }>;
  const bad: string[] = [];
  for (const mk of new Set([...Object.keys(docs), ...Object.keys(months)])) {
    const a = docs[mk] ?? { in: 0, out: 0 };
    const s = months[mk] ?? {};
    if ((s.in ?? 0) !== a.in || (s.out ?? 0) !== a.out) {
      bad.push(`${mk}: docs in/out=${a.in}/${a.out} · summary in/out=${s.in ?? 0}/${s.out ?? 0}`);
    }
  }
  return bad;
}

async function migrateStore(storeId: string): Promise<number> {
  const store = db.collection("stores").doc(storeId);
  console.log(`\n=== STORE: ${storeId} ===`);

  const rows = await collectRows(storeId);
  if (rows.length === 0) {
    console.log("  0 lançamento(s) de estoque.");
    return 0;
  }

  // Current per-month totals, to show the effect of the chosen mode.
  const fin = await store.collection("finance").get();
  const month: Record<string, { in: number; out: number }> = {};
  for (const f of fin.docs) {
    const d = f.data();
    if (!d.date) continue;
    const b = (month[monthKey((d.date as Timestamp).toDate())] ??= { in: 0, out: 0 });
    if (d.direction === "in") b.in += d.amount ?? 0;
    else b.out += d.amount ?? 0;
  }
  const removed: Record<string, number> = {};
  if (mode === "delete") for (const r of rows) removed[r.mk] = (removed[r.mk] ?? 0) + r.amount;

  console.log(`  ${rows.length} lançamento(s) source="stock" — modo: ${mode}`);
  for (const r of rows) {
    console.log(
      `    - ${r.id} · ${r.mk} · ${formatBRL(r.amount)} · ${r.category} · "${r.label}"${r.movementFound ? "" : " · (movimento de estoque não encontrado)"}`,
    );
  }

  console.log("\n  Saldo por mês (atual → depois):");
  console.log("    mês       entradas        saídas atual   saídas depois   saldo atual → depois");
  for (const mk of Object.keys(month).sort()) {
    const b = month[mk];
    const outAfter = b.out - (removed[mk] ?? 0);
    console.log(
      `    ${mk}  ${formatBRL(b.in).padStart(12)}  ${formatBRL(b.out).padStart(14)}  ${formatBRL(outAfter).padStart(14)}   ${formatBRL(b.in - b.out)} → ${formatBRL(b.in - outAfter)}${removed[mk] ? "  <-- muda" : ""}`,
    );
  }

  if (!apply) return rows.length;

  if (mode === "convert") {
    const batch = db.batch();
    for (const r of rows) {
      const d = r.snap.data()!;
      batch.update(
        r.ref,
        {
          source: "manual",
          stockItemId: FieldValue.delete(),
          createdBy: d.createdBy ?? "sistema",
          note: d.note ?? CONVERTED_NOTE,
        },
        // Fails the whole batch if any row changed since it was read above.
        { lastUpdateTime: r.snap.updateTime! },
      );
    }
    await batch.commit();
    console.log(`\n  ${rows.length} lançamento(s) convertido(s) em avulso (resumo inalterado).`);
  } else {
    const summaryRef = store.collection("meta").doc("summary");
    await db.runTransaction(async (tx) => {
      const [sum, ...fresh] = await Promise.all([tx.get(summaryRef), ...rows.map((r) => tx.get(r.ref))]);
      if (!sum.exists) {
        // The app's writers rebuild from an EMPTY base when the summary is absent — never delete blind.
        throw new Error("meta/summary ausente — abortando. Recompute o resumo antes (refreshStoreSummary em scripts/lib/summary.ts).");
      }
      const months = (sum.data()!.months ?? {}) as Record<string, { out?: number }>;
      const outByMonth: Record<string, number> = {};
      fresh.forEach((snap, i) => {
        const r = rows[i];
        const d = snap.data();
        if (!snap.exists || d?.source !== "stock" || d.amount !== r.amount) {
          throw new Error(`${r.id} mudou desde a leitura — abortando, rode de novo.`);
        }
        outByMonth[r.mk] = (outByMonth[r.mk] ?? 0) + r.amount;
      });
      // Month keys ("2026-10") aren't valid dotted field paths, hence FieldPath.
      const monthDeltas: unknown[] = [];
      for (const [mk, amount] of Object.entries(outByMonth)) {
        if ((months[mk]?.out ?? 0) < amount) {
          throw new Error(`summary.months[${mk}].out (${months[mk]?.out ?? 0}) < ${amount} — resumo já divergente, abortando.`);
        }
        monthDeltas.push(new FieldPath("months", mk, "out"), FieldValue.increment(-amount));
      }
      for (const r of rows) tx.delete(r.ref);
      tx.update(summaryRef, "updatedAt", Timestamp.now(), ...monthDeltas);
    });
    console.log(`\n  ${rows.length} lançamento(s) removido(s); saídas do resumo ajustadas.`);
  }

  const bad = await verifyStore(storeId);
  console.log(
    bad.length === 0
      ? "  verificação: finance docs == meta/summary (in/out) em todos os meses."
      : `  !! verificação FALHOU:\n    ${bad.join("\n    ")}`,
  );
  if (bad.length > 0) process.exitCode = 2;
  return rows.length;
}

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD (selet-prod)"} — modo: ${mode} — ${apply ? "APLICAR" : "dry run (nada será escrito)"}`,
  );
  const stores = onlyStore ? [db.collection("stores").doc(onlyStore)] : await db.collection("stores").listDocuments();
  let total = 0;
  for (const s of stores) total += await migrateStore(s.id);
  console.log(
    `\n${total} lançamento(s) ${apply ? (mode === "convert" ? "convertido(s)" : "removido(s)") : `seriam ${mode === "convert" ? "convertidos" : "removidos"} — rode com --apply para escrever`}.`,
  );
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
