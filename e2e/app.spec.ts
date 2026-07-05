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

  // --- Product
  await page.goto("/s/vila-velha/produtos");
  await page.getByRole("button", { name: "Novo produto" }).first().click();
  await page.locator("#product-name").fill("Bowl de salmão");
  await page.locator("#product-price").fill("39,90");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Produto criado.")).toBeVisible();
  await expect(page.getByText("Bowl de salmão")).toBeVisible();

  // --- Customer
  await page.goto("/s/vila-velha/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  await page.locator("#customer-name").fill("Carla Mendes");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Cliente criado.")).toBeVisible();
  await expect(page.getByText("Carla Mendes")).toBeVisible();

  // --- Order
  await page.goto("/s/vila-velha/pedidos");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.getByRole("combobox").click();
  await page.getByRole("option", { name: "Carla Mendes" }).click();
  await sheet.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("dialog").getByText("Bowl de salmão").click();
  await page.keyboard.press("Escape"); // close product picker
  await sheet.getByRole("button", { name: "Pago", exact: true }).click();
  await sheet.getByRole("button", { name: "Pix" }).click();
  await sheet.getByRole("button", { name: "Criar pedido" }).click();
  await expect(page.getByText("Pedido criado.")).toBeVisible();
  await expect(page.getByText("Carla Mendes").first()).toBeVisible();
  await expect(page.getByText("R$ 39,90").first()).toBeVisible();

  // --- Finance reflects the paid order
  await page.goto("/s/vila-velha/financeiro");
  await expect(page.getByText(/Pedido #/)).toBeVisible();

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
