import { expect, test } from "@playwright/test";
import { logIn, resetEmulator, seedCatalog } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
  await seedCatalog();
});

test("/equipe redirects into Configurações → Equipe", async ({ page, context, request, baseURL }) => {
  await logIn(request, context, baseURL!);
  await page.goto("/painel/vila-velha/equipe");
  await expect(page).toHaveURL(/\/painel\/vila-velha\/configuracoes\/equipe$/);
  await expect(page.getByRole("link", { name: "Equipe", exact: true })).toHaveAttribute("aria-current", "page");
});

test("a category created in Configurações shows up in the Estoque drawer", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto("/painel/vila-velha/configuracoes/estoque");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome").fill("Laticínios");
  await page.getByRole("button", { name: "Adicionar categoria" }).click();
  await expect(page.getByText("Laticínios", { exact: true })).toBeVisible();

  await page.goto("/painel/vila-velha/estoque");
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await page.getByText("Buscar item…").click();
  await page.getByText("Cadastrar novo item").click();
  await expect(page.getByRole("button", { name: "Laticínios" })).toBeVisible();
});

test("a category created in Configurações → Cardápio shows up in the Cardápio filter", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto("/painel/vila-velha/configuracoes/cardapio");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome").fill("Sobremesas");
  await page.getByRole("button", { name: "Adicionar categoria" }).click();
  await expect(page.getByText("Sobremesas", { exact: true })).toBeVisible();

  await page.goto("/painel/vila-velha/produtos");
  await page.getByRole("button", { name: "Todas as categorias" }).click();
  await expect(page.getByRole("menuitem", { name: "Sobremesas", exact: true })).toBeVisible();
});

test("the store Instagram is normalized (@ and case dropped) and pre-fills a new sorteio", async ({ page, context, request, baseURL }) => {
  await logIn(request, context, baseURL!);
  await page.goto("/painel/vila-velha/configuracoes/loja");
  await page.getByLabel("Instagram").fill("@Selet.VV");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Dados da loja atualizados.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Instagram")).toHaveValue("selet.vv");

  await page.goto("/painel/vila-velha/sorteios");
  await page.getByRole("button", { name: /novo sorteio/i }).first().click();
  await expect(page.getByLabel("Onde acontece o sorteio")).toHaveValue("Ao vivo no Instagram @selet.vv");
});
