/**
 * One-off migration for the typed sorteio rules. Per store, per raffle:
 *  - "Seguir @perfil" rules get kind "follow" + link (https://instagram.com/perfil).
 *    The text is kept as written, so the regulamento people accepted is untouched.
 *  - "Curtir…"/"Comentar…" rules are only listed: the post URL is not in the data,
 *    so the team pastes it in Sorteios › Editar (that re-dates the regulamento).
 *  - Everything else stays a free-text rule.
 *
 * The app already treats rules without a kind as free text, so running this is
 * an upgrade, not a prerequisite. Idempotent. Defaults to a dry run; pass --apply.
 *
 *   npx tsx scripts/migrate-raffle-rule-kinds.ts            # dry run
 *   npx tsx scripts/migrate-raffle-rule-kinds.ts --apply    # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (Application Default Credentials) — same convention as the other migrations.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { RaffleRule } from "../src/lib/raffles";
import { migrateRule } from "./lib/raffle-rule-kinds";

const apply = process.argv.includes("--apply");
const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  let typed = 0;
  const manual: string[] = [];
  for (const store of (await db.collection("stores").get()).docs) {
    const raffles = await store.ref.collection("raffles").get();
    if (raffles.empty) continue;
    console.log(`\n=== STORE: ${store.id} ===`);
    for (const doc of raffles.docs) {
      const { name, status, slug } = doc.data();
      const rules: RaffleRule[] = doc.data().rules ?? [];
      let changed = false;
      const next = rules.map((rule) => {
        const m = migrateRule(rule);
        if (m.change === "follow") {
          console.log(`  ${slug} (${status}): "${rule.text}" → seguir ${m.rule.link}`);
          typed++;
          changed = true;
          return m.rule;
        }
        if (m.change === "needs-post") manual.push(`${store.id}/${slug} (${status}, ${name}): "${rule.text}"`);
        return rule;
      });
      if (changed && apply) await doc.ref.update({ rules: next });
    }
  }
  console.log(`\n${typed} regra(s) ${apply ? "tipada(s)." : "seriam tipadas. Rode com --apply para escrever."}`);
  if (manual.length) {
    console.log(`\nPrecisam do link do post (editar no painel):\n${manual.map((l) => `  - ${l}`).join("\n")}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
