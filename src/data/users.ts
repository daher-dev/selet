import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { SessionUser, TeamMember } from "@/lib/types";

function usersCol() {
  return getDb().collection("users");
}

export async function getUserByEmail(
  email: string,
): Promise<SessionUser | null> {
  const snap = await usersCol().doc(email.toLowerCase()).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    email: snap.id,
    uid: d.uid ?? null,
    name: d.name,
    phone: d.phone,
    role: d.role,
    storeIds: d.storeIds,
    sections: d.sections ?? [],
    status: d.status,
  };
}

/** First login of an invited member: link the Firebase uid and activate. */
export async function activateInvitedUser(
  email: string,
  uid: string,
): Promise<void> {
  await usersCol().doc(email.toLowerCase()).update({
    uid,
    status: "ativo",
    firstLoginAt: FieldValue.serverTimestamp(),
  });
}

export interface InviteUserInput {
  email: string;
  name: string;
  phone?: string;
  role: "admin" | "funcionario";
  storeIds: string[] | "all";
  sections: string[];
}

export async function inviteUser(input: InviteUserInput): Promise<void> {
  const email = input.email.toLowerCase();
  const ref = usersCol().doc(email);
  const existing = await ref.get();
  if (existing.exists) throw new Error("Este e-mail já faz parte da equipe.");
  await ref.set({
    ...input,
    email,
    uid: null,
    status: "convidado",
    invitedAt: FieldValue.serverTimestamp(),
  });
}

export async function updateUserAccess(
  email: string,
  input: Omit<InviteUserInput, "email">,
): Promise<void> {
  await usersCol().doc(email.toLowerCase()).update({ ...input });
}

export async function setUserStatus(
  email: string,
  status: "ativo" | "inativo",
): Promise<void> {
  await usersCol().doc(email.toLowerCase()).update({ status });
}

export async function listUsers(): Promise<TeamMember[]> {
  const snap = await usersCol().get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      email: doc.id,
      uid: d.uid ?? null,
      name: d.name,
      phone: d.phone,
      role: d.role,
      storeIds: d.storeIds,
      sections: d.sections ?? [],
      status: d.status,
      invitedAt: d.invitedAt?.toDate().toISOString() ?? "",
      firstLoginAt: d.firstLoginAt?.toDate().toISOString(),
    };
  });
}
