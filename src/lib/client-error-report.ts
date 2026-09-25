export function reportClientError(error: Error & { digest?: string }) {
  const body = JSON.stringify({
    message: error.message,
    stack: error.stack,
    digest: error.digest,
    url: window.location.href,
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(
      "/api/client-error",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }

  fetch("/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
