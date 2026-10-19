import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { logIn, resetEmulator } from "./helpers";

test.describe.configure({ mode: "serial" });

const STORE = "vila-velha";
const RAFFLE = "e2e-sorteio";
const SLUG = "e2e-sorteio";

function db() {
  process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));
}

test.beforeAll(async ({ request }) => {
  await resetEmulator(request);
  const day = 86_400_000;
  await db().doc(`stores/${STORE}/raffles/${RAFFLE}`).set({
    name: "Sorteio E2E",
    prize: "1 mês de shakes",
    location: "Ao vivo no Instagram @selet.vv",
    pickup: "Retirada na loja",
    notes: "",
    slug: SLUG,
    status: "aberto",
    signupFrom: null,
    signupUntil: Timestamp.fromMillis(Date.now() + 5 * day),
    drawAt: Timestamp.fromMillis(Date.now() + 6 * day),
    numberFrom: 1,
    numberTo: 20,
    perPerson: 1,
    rules: [
      { id: "seg", text: "Seguir @selet.vv", type: "obr" },
      { id: "cur", text: "Curtir o post", type: "obr" },
    ],
    fields: { instagram: true, birthday: false, email: false },
    draws: [],
    winner: null,
    showResult: false,
    publishedAt: Timestamp.now(),
    regulamentoAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });
  await db().doc(`raffleSlugs/${SLUG}`).set({ storeId: STORE, raffleId: RAFFLE });
});

/** Walks the public flow as a brand-new visitor, ending on the number the caller picks. */
async function signUp(page: Page, opts: { phone: string; name: string; ig: string }) {
  await page.goto(`/s/${SLUG}`);
  await page.getByRole("button", { name: /Quero participar/ }).click();
  await page.getByLabel("WhatsApp").fill(opts.phone);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByPlaceholder("Como você se chama").fill(opts.name);
  await page.getByPlaceholder("seuperfil").fill(opts.ig);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Escolher meu número" }).click();
}

async function newVisitor(browser: Browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  return { context, page: await context.newPage() };
}

test("a logged-out visitor reaches the public link but not the admin", async ({ page }) => {
  await page.goto(`/s/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Concorra a 1 mês de shakes" })).toBeVisible();
  await expect(page.getByText("20 livres")).toBeVisible();

  await page.goto(`/painel/${STORE}/sorteios`);
  await expect(page).toHaveURL(/\/login$/);

  // (Status stays 200: the loading skeleton streams first, then the not-found screen.)
  await page.goto("/s/nao-existe");
  await expect(page.getByText("Esse sorteio não está disponível")).toBeVisible();
});

test("a visitor signs up, picks a number and gets it confirmed", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await signUp(page, { phone: "27999990001", name: "Ana Souza", ig: "anasouza" });
  await page.getByRole("button", { name: "Número 5" }).click();
  await page.getByRole("button", { name: "Confirmar o nº 05" }).click();
  await expect(page.getByText("Número 05 é seu, Ana!")).toBeVisible();
  await expect(page.getByText("Seguir @selet.vv")).toBeVisible();

  // The device remembers her: reopening the link shows the same number.
  await page.goto(`/s/${SLUG}`);
  await expect(page.getByText("Número 05 é seu, Ana!")).toBeVisible();
  await context.close();
});

test("a second visitor cannot take a number that is already chosen", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await signUp(page, { phone: "27999990002", name: "Bruno Lima", ig: "brunolima" });
  await expect(page.getByRole("button", { name: "Número 5, ocupado" })).toBeDisabled();
  await page.getByRole("button", { name: "Número 6" }).click();
  await page.getByRole("button", { name: "Confirmar o nº 06" }).click();
  await expect(page.getByText("Número 06 é seu, Bruno!")).toBeVisible();
  await context.close();

  // The same WhatsApp cannot enter twice.
  const again = await newVisitor(browser);
  await again.page.goto(`/s/${SLUG}`);
  await again.page.getByRole("button", { name: /Quero participar/ }).click();
  await again.page.getByLabel("WhatsApp").fill("27999990001");
  await again.page.getByRole("button", { name: "Continuar" }).click();
  await expect(again.page.getByText("Esse WhatsApp já está no sorteio")).toBeVisible();
  await again.context.close();
});

test("the team validates a participant, runs the draw and publishes the result", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await logIn(request, context, baseURL!);
  await page.goto(`/painel/${STORE}/sorteios`);
  await expect(page.getByText("2 aguardando conferência")).toBeVisible();

  await page.locator("a:visible", { hasText: "Sorteio E2E" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sorteios/${RAFFLE}$`));

  // Phone layout: one button per rule on each participant card.
  const ana = page.getByRole("listitem").filter({ hasText: "Ana Souza" });
  await ana.getByRole("button", { name: "Seguir @selet.vv" }).click();
  await ana.getByRole("button", { name: "Curtir o post" }).click();
  await expect(ana.getByText("Validado")).toBeVisible();

  await page.getByRole("button", { name: "Realizar sorteio" }).click();
  await page.getByLabel("Número sorteado").fill("6");
  // Bruno has not been checked yet: he cannot be confirmed as the winner.
  await expect(page.getByText(/ainda não cumpriu todas as regras/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar ganhador" })).toBeDisabled();

  await page.getByLabel("Número sorteado").fill("5");
  await page.getByRole("button", { name: "Confirmar ganhador" }).click();
  await expect(page.getByRole("dialog").getByText("Ganhador(a)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicar resultado" }).click();
  await expect(page.getByText(/Resultado publicado|aviso\(s\) por WhatsApp/)).toBeVisible();
});

test("the public link now shows the result", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await page.goto(`/s/${SLUG}`);
  await expect(page.getByText("Ana S. ganhou!")).toBeVisible();
  await expect(page.getByText("Prêmio: 1 mês de shakes")).toBeVisible();
  await context.close();
});
