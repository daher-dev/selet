import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createSessionCookie, destroySession } from "@/lib/session";
import { activateInvitedUser, getUserByEmail } from "@/data/users";
import { listStoresForUser } from "@/data/stores";

/**
 * Exchanges a Firebase ID token (from the Google sign-in popup) for a
 * server session cookie — after checking the invite-only allowlist.
 */
export async function POST(request: Request) {
  const { idToken } = (await request.json()) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ error: "idToken ausente." }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }
  if (!decoded.email) {
    return NextResponse.json({ error: "Conta sem e-mail." }, { status: 401 });
  }

  const email = decoded.email.toLowerCase();
  const user = await getUserByEmail(email);
  if (!user || user.status === "inativo") {
    return NextResponse.json(
      {
        error:
          "Conta não autorizada. Fale com o administrador para solicitar acesso.",
      },
      { status: 403 },
    );
  }

  if (user.status === "convidado" || user.uid !== decoded.uid) {
    await activateInvitedUser(email, decoded.uid);
  }

  await createSessionCookie(idToken);

  const stores = await listStoresForUser({ ...user, status: "ativo" });
  const redirectTo = stores[0] ? `/s/${stores[0].id}` : "/";
  return NextResponse.json({ redirectTo });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
