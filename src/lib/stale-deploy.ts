/**
 * A tab opened before a deploy calls Server Action IDs the new build no longer
 * has (Next throws UnrecognizedActionError). Retrying can't fix it — only a
 * full reload picks up the new build.
 */
export function isStaleDeployError(error: { name?: string; message?: string }): boolean {
  return (
    error.name === "UnrecognizedActionError" ||
    /Server Action .*was not found|Failed to find Server Action/i.test(error.message ?? "")
  );
}

const RELOAD_FLAG = "selet:stale-deploy-reload";

/** Reloads unless we already did in the last minute (avoids a loop); returns whether it reloaded. */
export function reloadOnceForStaleDeploy(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0) < 60_000) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false; // storage blocked: can't guard against a reload loop, show the error screen
  }
  window.location.reload();
  return true;
}
