import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getUserByEmail } from "@/data/users";
import type { Section, SessionUser } from "@/lib/types";
import { verifySession } from "./session";

export class ForbiddenError extends Error {
  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Session user for the current request (deduped via React.cache).
 * Returns null when unauthenticated or the member is not active.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await verifySession();
  if (!session) return null;
  const user = await getUserByEmail(session.email);
  if (!user || user.status !== "ativo") return null;
  return user;
});

/** Page-level guard: redirects to /login when unauthenticated. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function canAccessStore(user: SessionUser, storeId: string): boolean {
  return (
    user.role === "admin" ||
    user.storeIds === "all" ||
    user.storeIds.includes(storeId)
  );
}

export function canAccessSection(user: SessionUser, section: Section): boolean {
  return user.role === "admin" || user.sections.includes(section);
}

/**
 * The security gate. First line of every server action and every
 * store-scoped page. Throws ForbiddenError (actions surface it as an
 * error toast; pages let it hit the error boundary).
 */
export async function requireAccess(
  storeId: string,
  section: Section,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Sessão expirada. Entre novamente.");
  if (!canAccessStore(user, storeId) || !canAccessSection(user, section)) {
    throw new ForbiddenError();
  }
  return user;
}
