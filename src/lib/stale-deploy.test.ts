import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "./stale-deploy";

describe("isStaleDeployError", () => {
  it("matches the client-side UnrecognizedActionError seen in prod", () => {
    expect(
      isStaleDeployError({
        name: "UnrecognizedActionError",
        message: 'Server Action "60decc7d" was not found on the server.',
      }),
    ).toBe(true);
    expect(isStaleDeployError({ message: 'Server Action "60decc7d" was not found on the server.' })).toBe(true);
    expect(isStaleDeployError({ message: 'Failed to find Server Action "60decc7d".' })).toBe(true);
  });

  it("ignores ordinary errors", () => {
    expect(isStaleDeployError({ name: "Error", message: "Cannot read properties of undefined" })).toBe(false);
    expect(isStaleDeployError({})).toBe(false);
  });
});
