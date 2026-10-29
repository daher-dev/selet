/**
 * One-off: the "Adicional" sale type was retired from the product form. Turns
 * every `saleType: "adicional"` product into a Menu item that consumes its one
 * linked stock item per unit sold (what an adicional drew before):
 * recipe = [{ stockItemId: insumoId, qty: 1 (null for contínuo items) }], no
 * insumoId. Price tiers and everything else stay. Dry run by default.
 *
 *   npx tsx scripts/migrate-adicional-to-menu.ts            # dry run
 *   npx tsx scripts/migrate-adicional-to-menu.ts --apply     # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  let total = 0;
  for (const store of (await db.collection("stores").get()).docs) {
    const products = await db.collection(`stores/${store.id}/products`).where("saleType", "==", "adicional").get();
    for (const doc of products.docs) {
      const d = doc.data();
      const stock = d.insumoId ? (await db.doc(`stores/${store.id}/stockItems/${d.insumoId}`).get()).data() : undefined;
      if (!stock) {
        console.log(`  !! ${store.id}/${d.name}: item de estoque ${d.insumoId ?? "(nenhum)"} não encontrado — pulado`);
        continue;
      }
      const continuo = stock.consumptionMode === "continuo";
      const recipe = [{ stockItemId: d.insumoId, name: stock.name, qty: continuo ? null : 1, unit: stock.unit }];
      const tiers = d.tiers?.length ? d.tiers : [{ qty: 1, price: d.price ?? 0 }];
      total++;
      console.log(`  ${store.id}/${d.name}: adicional → menu · consome ${stock.name} (${continuo ? "sem medição" : `1 ${stock.unit}`}) · preço ${d.price}`);
      if (apply) {
        await doc.ref.update({
          saleType: "menu",
          recipe,
          adicionais: d.adicionais ?? [],
          sale: { recipe, adicionais: d.adicionais ?? [], tiers },
          resale: FieldValue.delete(),
          insumoId: FieldValue.delete(),
          commissionPercent: FieldValue.delete(),
        });
      }
    }
  }
  console.log(`\n${total} produto(s) ${apply ? "migrado(s)." : "seriam migrados — rode com --apply."}`);
}

main().then(() => process.exit(0));
