const MISSING_SERVER_ACTION_PATTERNS = [
  /Server Action ".*" was not found on the server/i,
  /failed-to-find-server-action/i,
  /UnrecognizedActionError/i,
];

export function isMissingServerActionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}\n${error.message}\n${error.stack ?? ""}`
      : String(error ?? "");
  return MISSING_SERVER_ACTION_PATTERNS.some((pattern) => pattern.test(message));
}
