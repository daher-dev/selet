import { expect, test } from "@playwright/test";
import { BOOTSTRAP_STORES, logIn, resetEmulator, seedCatalog } from "./helpers";

test.describe.configure({ mode: "serial" });

const CATEGORY_CHIPS = ["Shakes", "Waffles", "Salgados", "Bebidas", "Lanches", "Adicionais"];

// Frutas Vermelhas is priced per store — proof the price book is applied.
const FRUTAS_VERMELHAS_PRICE: Record<string, string> = {
  "vila-velha": "R$ 36,00",
  passos: "R$ 33,00",
};

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
  await seedCatalog();
});

test("bootstrapped catalog renders for both stores", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);

  for (const store of BOOTSTRAP_STORES) {
    // --- Catálogo (produtos)
    await page.goto(`/s/${store.id}/produtos`);

    // All six real menu categories show as filter chips.
    for (const chip of CATEGORY_CHIPS) {
      await expect(
        page.getByRole("button", { name: chip, exact: true }),
        `${chip} chip in ${store.id}`,
      ).toBeVisible();
    }

    // A seeded product with its store-specific price and description copy.
    await expect(page.getByText("Frutas Vermelhas", { exact: true })).toBeVisible();
    await expect(page.getByText(/borda de Morango e calda de Fibra de Uva/)).toBeVisible();
    await expect(
      page.getByText(FRUTAS_VERMELHAS_PRICE[store.id]).first(),
    ).toBeVisible();

    await page.screenshot({
      path: `test-results/catalog-produtos-${store.id}.png`,
      fullPage: true,
    });

    // Filtering by a category narrows the list to that section.
    await page.getByRole("button", { name: "Bebidas", exact: true }).click();
    await expect(page.getByText("Sunset", { exact: true })).toBeVisible();
    await expect(page.getByText("Frutas Vermelhas", { exact: true })).toHaveCount(0);

    // --- Estoque (Herbalife supply, imported as stock items)
    await page.goto(`/s/${store.id}/estoque`);
    await expect(page.getByText(/Whey Protein 3W/)).toBeVisible();
    await expect(page.getByText(/Fiber Powder/)).toBeVisible();

    // The personal-care (beleza) line is archived → hidden by default…
    await expect(page.getByText(/SKIN - Cleanser/)).toHaveCount(0);

    await page.screenshot({
      path: `test-results/catalog-estoque-${store.id}.png`,
      fullPage: true,
    });

    // …and revealed by the Arquivados toggle.
    await page.getByRole("button", { name: /Arquivados/ }).click();
    await expect(page.getByText(/SKIN - Cleanser/)).toBeVisible();
    await expect(page.getByText(/Whey Protein 3W/)).toHaveCount(0);
  }
});
