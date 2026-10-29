import { expect, test } from "@playwright/test";
import { logIn, resetEmulator } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
});

// Covers the new Movimentações screen end-to-end: the dashboard's "Ver
// todas" link, the full list with its filter pills, creating/editing an
// avulso lançamento, and following a vinculado row's Origem chip back to its
// source (the order it mirrors) with the target page auto-opening the right
// sheet. The stock-sourced vinculado branch (its own stockItemId deep-link)
// is exercised at the data layer in stock.emulator.test.ts and at the
// component layer in manual-tx-sheet.test.tsx instead of here — scripting a
// second full "Registrar compra" purchase flow just to re-prove the same
// query-param mechanism this order case already proves live in a real
// browser would add e2e cost without meaningfully more confidence.
test("Movimentações: dashboard link, create/edit avulso, follow a vinculado Origem chip", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);

  // --- Build one paid order, so Financeiro has a vinculado (source: order) row.
  await page.goto("/painel/vila-velha/estoque");
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await page.getByRole("button", { name: "Buscar item…" }).click();
  await page.getByRole("button", { name: "Cadastrar novo item" }).click();
  await page.getByPlaceholder("Ex: Leite de coco").fill("Salmão");
  await page.getByRole("button", { name: "Adicionar ao estoque" }).click();
  await expect(page.getByText("Item adicionado ao estoque.")).toBeVisible();

  await page.goto("/painel/vila-velha/produtos");
  await page.getByRole("button", { name: "Novo produto" }).first().click();
  await page.locator("#product-name").fill("Bowl de salmão");
  await page.getByRole("button", { name: "Receita", exact: true }).click();
  await page.locator("#product-price").fill("39,90");
  await page.getByRole("button", { name: "Adicionar insumo" }).click();
  await page.getByRole("button", { name: "Salmão" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Produto criado.")).toBeVisible();

  await page.goto("/painel/vila-velha/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  await page.locator("#customer-name").fill("Carla Mendes");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(page.getByText("Cliente criado.")).toBeVisible();

  await page.goto("/painel/vila-velha/pedidos");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const orderSheet = page.locator('[data-slot="sheet-content"]');
  await orderSheet.getByRole("button", { name: "Selecione um cliente" }).click();
  await page.getByRole("button", { name: "Carla Mendes" }).click();
  await orderSheet
    .getByRole("button", { name: "Nenhum item — toque para adicionar do cardápio." })
    .click();
  await page.getByRole("dialog").getByText("Bowl de salmão").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Adicionar", exact: true })
    .click();
  await orderSheet.getByRole("button", { name: "Pago", exact: true }).click();
  await orderSheet.getByRole("button", { name: "Pix" }).click();
  await orderSheet.getByRole("button", { name: /Lançar venda/ }).click();
  await expect(page.getByText("Pedido criado.")).toBeVisible();

  // --- Dashboard → "Ver todas" opens the full list, scoped to this month.
  await page.goto("/painel/vila-velha/financeiro");
  await page.getByRole("link", { name: "Ver todas" }).click();
  await expect(page).toHaveURL(/\/financeiro\/movimentacoes\?mes=\d{4}-\d{2}$/);
  await expect(page.getByRole("heading", { name: "Movimentações" })).toBeVisible();

  // The paid order shows up as a Vinculado row, with a locked Ações cell —
  // not editable/deletable here. .last(): every row renders once for the
  // desktop DataList (CSS-hidden below 820px) and once for the mobile card
  // stack — this suite runs mobile-chromium, so the mobile (later-in-DOM)
  // copy is the visible one, same reasoning as app.spec.ts's "Carla Mendes" checks.
  const orderRow = page.getByText(/Pedido #.* · Carla Mendes/).last();
  await expect(orderRow).toBeVisible();

  // Filter pills narrow the list.
  await page.getByRole("button", { name: "Avulsos", exact: true }).click();
  await expect(page.getByText(/Pedido #/)).toHaveCount(0);
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(orderRow).toBeVisible();

  // --- Create an avulso lançamento from this page's own "Novo lançamento".
  await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const txSheet = page.locator('[data-slot="sheet-content"]');
  await txSheet.locator("#tx-label").fill("Aluguel · Vila Velha");
  await txSheet.locator("#tx-amount").fill("4200,00");
  await txSheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançamento registrado.")).toBeVisible();
  await expect(page.getByText("Aluguel · Vila Velha").last()).toBeVisible();
  await expect(page.getByText("R$ 4.200,00").last()).toBeVisible();

  // --- Edit it: open by clicking the row, change the value, save.
  await page.getByText("Aluguel · Vila Velha").last().click();
  await expect(txSheet.getByText("Editar lançamento")).toBeVisible();
  const amountField = txSheet.locator("#tx-amount");
  await amountField.fill("4500,00");
  await txSheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançamento atualizado.")).toBeVisible();
  await expect(page.getByText("R$ 4.500,00").last()).toBeVisible();

  // --- Follow the vinculado row's Origem chip back to the order.
  await orderRow.click();
  await expect(txSheet.getByText("Lançamento vinculado")).toBeVisible();
  await txSheet.getByRole("link").click();
  await expect(page).toHaveURL(/\/painel\/vila-velha\/pedidos\?order=/);
  // The origin order's sheet auto-opens on arrival.
  await expect(orderSheet.getByText("Carla Mendes")).toBeVisible();
  // The open order stays in the URL so the link is shareable; closing removes it.
  await expect(page).toHaveURL(/\/painel\/vila-velha\/pedidos\?order=/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/painel\/vila-velha\/pedidos$/);
});

// Seller commission end-to-end: turn it on for the product the test above
// created, sell it paid (the seller defaults to whoever is launching), then see
// the commission accrue in Financeiro (Saídas + the per-seller section) and pay it.
test("Comissão: produto com comissão → pedido pago → Financeiro → registrar pagamento", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);

  // --- 10% commission on the "Bowl de salmão" recipe item.
  await page.goto("/painel/vila-velha/produtos");
  await page.getByText("Bowl de salmão").first().click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.getByRole("switch", { name: "Pagar comissão do vendedor" }).click();
  await sheet.locator("#product-commission-sale").fill("10");
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Produto atualizado.")).toBeVisible();
  await expect(page.getByText("10% comissão")).toBeVisible();

  // --- A paid order sold by the logged-in admin (R$ 39,90 → R$ 3,99).
  await page.goto("/painel/vila-velha/pedidos");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  await sheet.getByRole("button", { name: "Selecione um cliente" }).click();
  await page.getByRole("button", { name: "Carla Mendes" }).click();
  await expect(sheet.getByRole("combobox", { name: "Vendido por" })).toContainText("João Daher");
  await sheet
    .getByRole("button", { name: "Nenhum item — toque para adicionar do cardápio." })
    .click();
  await page.getByRole("dialog").getByText("Bowl de salmão").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Adicionar", exact: true })
    .click();
  await expect(sheet.getByText(/Comissão de João/)).toBeVisible();
  await expect(sheet.getByText("R$ 3,99", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Pago", exact: true }).click();
  await sheet.getByRole("button", { name: "Pix" }).click();
  await sheet.getByRole("button", { name: /Lançar venda/ }).click();
  await expect(page.getByText("Pedido criado.")).toBeVisible();

  // --- Financeiro: the section lists the seller, and the payout flips it to "Pago".
  const month = new Date()
    .toLocaleString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" })
    .toLowerCase();
  await page.goto("/painel/vila-velha/financeiro");
  const section = page.getByRole("region", { name: `Comissões de ${month}` });
  await expect(section.getByText("João Daher")).toBeVisible();
  await expect(section.getByText("R$ 3,99").first()).toBeVisible();
  await section.getByRole("button", { name: /Registrar pagamento/ }).click();
  await page.getByRole("menuitem", { name: "Pix" }).click();
  await expect(page.getByText("Pagamento de comissão registrado.")).toBeVisible();
  await expect(section.getByText(/Pago em/)).toBeVisible();

  // --- The payout is a locked, linked row in Movimentações.
  await page.goto("/painel/vila-velha/financeiro/movimentacoes");
  await expect(page.getByText("Comissão · João Daher").last()).toBeVisible();
});
