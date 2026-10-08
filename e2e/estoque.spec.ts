import { expect, test } from "@playwright/test";
import { logIn, resetEmulator, seedCatalog, setStockBalance } from "./helpers";

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
  await seedCatalog();
  // Per-unit item: 7 un/caixa — 3 boxes sealed, one open with 5 left.
  await setStockBalance("vila-velha", "barra-de-proteina-citrus-lemon-e-peanut", { sealed: 3, open: 5 });
});

test("Ajustar embalagem aberta corrects a per-unit balance and logs it in the history", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto("/s/vila-velha/estoque");

  const adjust = page.getByRole("button", { name: /Ajustar saldo da embalagem aberta de Barra de Proteína/ });
  await expect(adjust).toBeVisible();
  const before = Number((await adjust.innerText()).match(/Restam (\d+) de 7 un/)?.[1]);
  expect(before).toBeGreaterThan(0);

  await adjust.click();
  const dialog = page.getByRole("dialog", { name: "Ajustar embalagem aberta" });
  await expect(dialog.getByRole("button", { name: "Salvar ajuste" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Diminuir" }).click();
  await expect(dialog.getByText(`${before} → ${before - 1} un.`)).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar ajuste" }).click();

  await expect(page.getByText(`Saldo ajustado para ${before - 1} un.`)).toBeVisible();
  await expect(adjust).toContainText(`Restam ${before - 1} de 7 un`);

  // The correction shows up in the item's history, without an edit button.
  await page.getByRole("button", { name: "Abrir Barra de Proteína" }).click({ position: { x: 24, y: 24 } });
  const note = page.getByText(`Contagem errada · ${before} → ${before - 1} un`);
  await expect(note).toBeVisible();
  const row = note.locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
  await expect(row).toContainText("AJUSTE");
  await expect(row.getByRole("button", { name: /Editar movimentação/ })).toHaveCount(0);
});
