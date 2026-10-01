import { expect, test } from "@playwright/test";
import { logIn, resetEmulator, seedCatalog } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
  await seedCatalog();
});

test("/equipe redirects into Configurações → Equipe", async ({ page, context, request, baseURL }) => {
  await logIn(request, context, baseURL!);
  await page.goto("/s/vila-velha/equipe");
  await expect(page).toHaveURL(/\/s\/vila-velha\/configuracoes\/equipe$/);
  await expect(page.getByRole("link", { name: "Equipe", exact: true })).toHaveAttribute("aria-current", "page");
});

test("a category created in Configurações shows up in the Estoque drawer", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto("/s/vila-velha/configuracoes/estoque");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome").fill("Laticínios");
  await page.getByRole("button", { name: "Adicionar categoria" }).click();
  await expect(page.getByText("Laticínios", { exact: true })).toBeVisible();

  await page.goto("/s/vila-velha/estoque");
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await page.getByText("Buscar insumo…").click();
  await page.getByText("Cadastrar novo item").click();
  await expect(page.getByRole("button", { name: "Laticínios" })).toBeVisible();
});
