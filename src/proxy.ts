import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";

/**
 * Cheap cookie-presence gate only — firebase-admin cannot run here.
 * Real verification happens in lib/access.ts (pages and server actions).
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except static assets and API routes (which handle their
  // own auth — session exchange and client-error reporting must work
  // without a cookie).
  matcher: ["/((?!api/|_next|icon.svg|favicon.ico).*)"],
};
