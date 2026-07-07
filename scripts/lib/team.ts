/**
 * Team members to provision besides the admin. Mirrors the in-app invite flow
 * (src/data/users.ts): the doc id is the lowercased email, and members start as
 * `convidado` with no uid — the /api/session route activates them (sets uid +
 * status "ativo") on their first Google sign-in.
 *
 * Idempotent: an already-existing user is left untouched, so re-running never
 * resets someone who has already logged in.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";

interface Invite {
  email: string;
  name: string;
  role: "admin" | "funcionario";
  storeIds: string[] | "all";
  sections: string[];
}

export const INVITES: Invite[] = [
  {
    // Passos/MG employee — operational access only (no financeiro, no equipe).
    email: "nasc90324@gmail.com",
    name: "Nasc90324",
    role: "funcionario",
    storeIds: ["passos"],
    sections: ["pedidos", "clientes", "produtos", "estoque"],
  },
];

export async function seedInvites(db: Firestore): Promise<string[]> {
  const created: string[] = [];
  for (const inv of INVITES) {
    const email = inv.email.toLowerCase();
    const ref = db.doc(`users/${email}`);
    if ((await ref.get()).exists) continue;
    await ref.set({
      ...inv,
      email,
      uid: null,
      status: "convidado",
      invitedAt: FieldValue.serverTimestamp(),
    });
    created.push(email);
  }
  return created;
}
