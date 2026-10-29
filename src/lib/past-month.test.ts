import { describe, expect, it } from "vitest";
import { isPastMonth, monthLabel } from "./past-month";

describe("past month", () => {
  const now = new Date("2026-10-15T12:00:00-03:00");
  it("flags only months before the current one", () => {
    expect(isPastMonth("2026-09", now)).toBe(true);
    expect(isPastMonth("2026-10", now)).toBe(false);
    expect(isPastMonth("2026-11", now)).toBe(false);
  });
  it("uses the store timezone at the month boundary", () => {
    // 01:00 UTC on Oct 1 is still Sep 30 in São Paulo.
    expect(isPastMonth("2026-09", new Date("2026-10-01T01:00:00Z"))).toBe(false);
    expect(isPastMonth("2026-09", new Date("2026-10-01T04:00:00Z"))).toBe(true);
  });
  it("labels months in Portuguese", () => expect(monthLabel("2026-09")).toBe("setembro de 2026"));
});
