import { expect, test } from "@playwright/test";
import { BOOTSTRAP_STORES, logIn, resetEmulator, seedCatalog } from "./helpers";

test.describe.configure({ mode: "serial" });

const CATEGORIES = ["Shakes", "Waffles", "Salgados", "Bebidas", "Lanches", "Adicionais"];

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

    // The Categoria filter (a dropdown) offers all six real menu sections.
    const categoria = page.getByRole("combobox").first();
    await categoria.click();
    for (const cat of CATEGORIES) {
      await expect(
        page.getByRole("option", { name: cat, exact: true }),
        `${cat} option in ${store.id}`,
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");

    // A seeded product with its store-specific price and its BASE recipe row.
    await expect(page.getByText("Frutas Vermelhas", { exact: true })).toBeVisible();
    await expect(page.getByText("Shake Herbalife Baunilha").first()).toBeVisible();
    await expect(
      page.getByText(FRUTAS_VERMELHAS_PRICE[store.id]).first(),
    ).toBeVisible();

    await page.screenshot({
      path: `test-results/catalog-produtos-${store.id}.png`,
      fullPage: true,
    });

    // Filtering by a category narrows the list to that section.
    await categoria.click();
    await page.getByRole("option", { name: "Bebidas", exact: true }).click();
    await expect(page.getByText("Sunset", { exact: true })).toBeVisible();
    await expect(page.getByText("Frutas Vermelhas", { exact: true })).toHaveCount(0);

    // --- Estoque (café insumos, imported as tracked stock items)
    await page.goto(`/s/${store.id}/estoque`);
    await expect(page.getByText("Fiber Concentrate", { exact: true })).toBeVisible();
    await expect(page.getByText("Morango", { exact: true })).toBeVisible();

    // The old Herbalife retail SKUs are gone — the list is the café taxonomy now.
    await expect(page.getByText(/Whey Protein 3W/)).toHaveCount(0);
    await expect(page.getByText(/SKIN - Cleanser/)).toHaveCount(0);

    // The café seed ships nothing archived, so the Arquivados toggle isn't offered.
    await expect(page.getByRole("button", { name: /Arquivados/ })).toHaveCount(0);

    await page.screenshot({
      path: `test-results/catalog-estoque-${store.id}.png`,
      fullPage: true,
    });
  }
});
