import type { APIRequestContext, BrowserContext } from "@playwright/test";

const FIRESTORE = "http://localhost:8080";
const AUTH = "http://localhost:9099";
const PROJECT = "selet-prod";
export const ADMIN_EMAIL = "joao@daher.dev";

const OWNER = { Authorization: "Bearer owner" };

/** Wipes both emulators and seeds the store + admin allowlist doc. */
export async function resetEmulator(request: APIRequestContext) {
  await request.delete(
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
  );
  await request.delete(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);

  await request.patch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/stores/vila-velha`,
    {
      headers: OWNER,
      data: {
        fields: {
          name: { stringValue: "Vila Velha/ES" },
          sub: { stringValue: "Loja matriz" },
          initial: { stringValue: "V" },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      },
    },
  );

  await request.patch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${ADMIN_EMAIL}`,
    {
      headers: OWNER,
      data: {
        fields: {
          email: { stringValue: ADMIN_EMAIL },
          uid: { nullValue: null },
          name: { stringValue: "João Daher" },
          role: { stringValue: "admin" },
          storeIds: { stringValue: "all" },
          sections: { arrayValue: {} },
          status: { stringValue: "ativo" },
          invitedAt: { timestampValue: new Date().toISOString() },
        },
      },
    },
  );
}

/** Mints an emulator ID token for the admin (creates the auth user if needed). */
export async function mintIdToken(request: APIRequestContext): Promise<string> {
  const signUp = await request.post(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    { data: { email: ADMIN_EMAIL, password: "e2e-password", returnSecureToken: true } },
  );
  if (signUp.ok()) return (await signUp.json()).idToken;

  const signIn = await request.post(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    { data: { email: ADMIN_EMAIL, password: "e2e-password", returnSecureToken: true } },
  );
  return (await signIn.json()).idToken;
}

/** Full login: exchanges an emulator ID token for the app session cookie. */
export async function logIn(
  request: APIRequestContext,
  context: BrowserContext,
  baseURL: string,
) {
  const idToken = await mintIdToken(request);
  const res = await request.post(`${baseURL}/api/session`, {
    data: { idToken },
  });
  if (!res.ok()) throw new Error(`session exchange failed: ${res.status()}`);

  const setCookie = res.headers()["set-cookie"] ?? "";
  const value = setCookie.match(/__session=([^;]+)/)?.[1];
  if (!value) throw new Error("no __session cookie in response");

  await context.addCookies([
    {
      name: "__session",
      value,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
