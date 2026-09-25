import { describe, expect, it } from "vitest";
import { isMissingServerActionError } from "./server-action-error";

describe("isMissingServerActionError", () => {
  it("matches Next missing server action errors", () => {
    expect(
      isMissingServerActionError(
        new Error(
          'Server Action "402170d61b1a41afeee3141fd0091154c25d9c812c" was not found on the server.',
        ),
      ),
    ).toBe(true);
  });

  it("matches the documented error slug in stack traces", () => {
    expect(
      isMissingServerActionError(
        "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action",
      ),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isMissingServerActionError(new Error("Preço inválido."))).toBe(false);
  });
});
