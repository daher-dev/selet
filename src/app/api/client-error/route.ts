import { NextResponse } from "next/server";

/**
 * Receives browser-side crash reports from the error boundaries and writes
 * them to stderr, where Cloud Logging records them as severity ERROR —
 * picked up by Error Reporting and the "Selet: erros no servidor" alert.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    stack?: string;
    digest?: string;
    url?: string;
  };

  console.error("[client-error]", {
    message: String(body.message ?? "").slice(0, 500),
    stack: String(body.stack ?? "").slice(0, 4000),
    digest: String(body.digest ?? "").slice(0, 100),
    url: String(body.url ?? "").slice(0, 500),
    userAgent: request.headers.get("user-agent")?.slice(0, 200),
  });

  return NextResponse.json({ ok: true });
}
