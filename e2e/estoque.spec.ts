import { expect, test } from "@playwright/test";
import { logIn, resetEmulator, seedCatalog, setStockBalance } from "./helpers";

const BARRA = "barra-de-proteina-citrus-lemon-e-peanut";

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
  await seedCatalog();
  // Per-unit item: 7 un/caixa — 3 boxes sealed in the Loja, one open with 5 left, nothing in the Depósito.
  await setStockBalance("vila-velha", BARRA, { sealed: 3, open: 5, depSealed: 0 });
});

test("Ajustar embalagem aberta corrects a per-unit balance and logs it in the ledger", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto("/painel/vila-velha/estoque");

  const adjust = page.getByRole("button", { name: /Ajustar saldo da embalagem aberta de Barra de Proteína/ });
  await expect(adjust).toBeVisible();
  await expect(adjust).toContainText("3 caixas + 5 un");

  await adjust.click();
  const dialog = page.getByRole("dialog", { name: "Ajustar embalagem aberta" });
  await expect(dialog.getByRole("button", { name: "Salvar ajuste" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Diminuir" }).click();
  await dialog.getByRole("button", { name: "Salvar ajuste" }).click();

  await expect(page.getByText("Saldo ajustado para 4 un.")).toBeVisible();
  await expect(adjust).toContainText("3 caixas + 4 un");

  // The correction shows up in the item's ledger, without an edit button.
  await page.getByRole("button", { name: "Abrir Barra de Proteína" }).click({ position: { x: 24, y: 24 } });
  const row = page.getByText("Ajuste · Contagem errada");
  await expect(row).toBeVisible();
  await expect(page.getByText("5 → 4 un")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Editar ajuste/ })).toHaveCount(0);
});

test("a purchase into the Depósito is transferred to the Loja, and both land in the ledger", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto("/painel/vila-velha/estoque");

  // Compra → Depósito (the default destination)
  await page.getByRole("button", { name: "Registrar compra" }).click();
  const compra = page.getByRole("dialog", { name: "Registrar compra" });
  await compra.getByRole("button", { name: "Buscar item…" }).click();
  await compra.getByRole("button", { name: /^Barra de Proteína/ }).click();
  await expect(compra.getByRole("button", { name: /Depósito/ })).toHaveAttribute("aria-pressed", "true");
  await compra.getByRole("textbox", { name: /caixas/i }).fill("2");
  await compra.getByRole("textbox", { name: /Custo total/ }).fill("100,00");
  await compra.getByRole("button", { name: "Lançar no depósito" }).click();
  await expect(page.getByText("Compra lançada no depósito.")).toBeVisible();

  const depRow = page.getByRole("button", { name: /Transferir Barra de Proteína do depósito/ });
  await expect(depRow).toContainText("2 caixas");

  // Depósito row → Transferir para a loja with the item ready
  await depRow.click();
  const sheet = page.getByRole("dialog", { name: "Transferir para a loja" });
  await expect(sheet.getByText(/Depósito 2 → \d caixas?/)).toBeVisible();
  await sheet.getByRole("button", { name: "Transferir 1 item" }).click();
  await expect(page.getByText(/Transferência TR-0001 registrada/)).toBeVisible();

  // Both movements are in the item's ledger; the transfer shows on both sides
  await page.getByRole("button", { name: "Abrir Barra de Proteína" }).click({ position: { x: 24, y: 24 } });
  await expect(page.getByText("Transferência · TR-0001")).toBeVisible();
  await expect(page.getByText(/caixas? para o depósito/)).toBeVisible();

  const local = page.getByRole("group", { name: "Local" });
  await local.getByRole("button", { name: "Depósito" }).click();
  await expect(page.getByText("Transferência · TR-0001")).toBeVisible();
  await local.getByRole("button", { name: "Loja" }).click();
  await expect(page.getByText("Transferência · TR-0001")).toBeVisible();
  await expect(page.getByText(/para o depósito/)).toHaveCount(0);
});
