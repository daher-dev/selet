export function reportClientError(error: Error & { digest?: string }) {
  const body = JSON.stringify({
    message: String(error.message ?? "").slice(0, 500),
    stack: String(error.stack ?? "").slice(0, 4000),
    digest: String(error.digest ?? "").slice(0, 100),
    url: String(window.location.href ?? "").slice(0, 500),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const queued = navigator.sendBeacon(
      "/api/client-error",
      new Blob([body], { type: "application/json" }),
    );
    if (queued) return;
  }

  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
