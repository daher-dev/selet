import "server-only";

import { cookies } from "next/headers";
import { adminAuth } from "./firebase-admin";

export const SESSION_COOKIE = "__session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function createSessionCookie(idToken: string): Promise<void> {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

/**
 * Returns the decoded session (uid, email, …) or null when absent/invalid.
 * checkRevoked is skipped here for per-request speed; logout revokes the
 * cookie by clearing it, and deactivated members are rejected by the
 * users/{email} status check in access.ts.
 */
export async function verifySession(): Promise<{
  uid: string;
  email: string;
} | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie);
    if (!decoded.email) return null;
    return { uid: decoded.uid, email: decoded.email.toLowerCase() };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (cookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie);
      await adminAuth.revokeRefreshTokens(decoded.uid);
    } catch {
      // Already invalid — nothing to revoke.
    }
  }
}
