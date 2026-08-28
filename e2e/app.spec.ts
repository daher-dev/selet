import { expect, test } from "@playwright/test";
import { logIn, resetEmulator } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
});

test("unauthenticated visitor is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Entrar com Google/ })).toBeVisible();
});

test("full flow: login → product → customer → order → paid → dashboard", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);

  // Landing redirects into the store dashboard.
  await page.goto("/");
  await expect(page).toHaveURL(/\/s\/vila-velha$/);

  // --- Stock item: a fresh store has no Estoque yet, and a menu product
  // now requires its base recipe to link to a real insumo ("no catalog
  // holes" — see product-form-sheet.tsx's submit()), so create one first.
  // The only entry point on an empty store is via "Registrar compra" →
  // insumo picker → "Cadastrar novo item".
  await page.goto("/s/vila-velha/estoque");
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await page.getByRole("button", { name: "Buscar insumo…" }).click();
  await page.getByRole("button", { name: "Cadastrar novo item" }).click();
  await page.getByPlaceholder("Ex: Leite de coco").fill("Salmão");
  await page.getByRole("button", { name: "Adicionar ao estoque" }).click();
  await expect(page.getByText("Item adicionado ao estoque.")).toBeVisible();

  // --- Product
  await page.goto("/s/vila-velha/produtos");
  await page.getByRole("button", { name: "Novo produto" }).first().click();
  await page.locator("#product-name").fill("Bowl de salmão");
  await page.locator("#product-price").fill("39,90");
  await page.getByRole("button", { name: "Adicionar insumo" }).click();
  await page.getByRole("button", { name: "Salmão" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Produto criado.")).toBeVisible();
  await expect(page.getByText("Bowl de salmão")).toBeVisible();

  // --- Customer
  await page.goto("/s/vila-velha/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  await page.locator("#customer-name").fill("Carla Mendes");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(page.getByText("Cliente criado.")).toBeVisible();
  await expect(page.getByText("Carla Mendes").last()).toBeVisible();

  // --- Order
  await page.goto("/s/vila-velha/pedidos");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.getByRole("button", { name: "Selecione um cliente" }).click();
  await page.getByRole("button", { name: "Carla Mendes" }).click();
  // Fresh order (no items yet) shows the dashed empty-state trigger, not the
  // "Adicionar item" button (that only renders once items.length > 0).
  await sheet
    .getByRole("button", { name: "Nenhum item — toque para adicionar do cardápio." })
    .click();
  await page.getByRole("dialog").getByText("Bowl de salmão").click();
  // Config step: confirm quantity 1 (no add-ons); adding closes the picker.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Adicionar", exact: true })
    .click();
  await sheet.getByRole("button", { name: "Pago", exact: true }).click();
  await sheet.getByRole("button", { name: "Pix" }).click();
  // Submit label is "Lançar venda · R$ X,XX" (actionVerb() + total), not a
  // fixed "Criar pedido" string.
  await sheet.getByRole("button", { name: /Lançar venda/ }).click();
  await expect(page.getByText("Pedido criado.")).toBeVisible();
  // .last(): the closed CustomerPicker popover leaves a hidden (but still
  // mounted) "Carla Mendes" match earlier in the DOM — same reasoning as
  // the Clientes list assertion above.
  await expect(page.getByText("Carla Mendes").last()).toBeVisible();
  await expect(page.getByText("R$ 39,90").last()).toBeVisible();

  // --- Finance reflects the paid order
  await page.goto("/s/vila-velha/financeiro");
  await expect(page.getByText(/Pedido #/).first()).toBeVisible();

  // --- Dashboard KPIs reflect everything
  await page.goto("/s/vila-velha");
  await expect(page.getByText("Pedidos por canal")).toBeVisible();
  await expect(page.getByText("Bowl de salmão")).toBeVisible(); // top seller
});

test("unknown Google account is rejected by the allowlist", async ({ request, baseURL }) => {
  const signUp = await request.post(
    "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
    { data: { email: "intruso@gmail.com", password: "x12345678", returnSecureToken: true } },
  );
  const { idToken } = await signUp.json();
  const res = await request.post(`${baseURL}/api/session`, { data: { idToken } });
  expect(res.status()).toBe(403);
});
