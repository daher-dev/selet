import { describe, expect, it } from "vitest";
import { addZonedMonths, monthKey, zonedTimeToUtc } from "./timezone";

describe("monthKey", () => {
  it("buckets 23:30 BRT on the last day of the month into THAT month", () => {
    // 2026-07-31T23:30 BRT == 2026-08-01T02:30Z
    expect(monthKey(new Date("2026-08-01T02:30:00.000Z"))).toBe("2026-07");
  });

  it("22:00 BRT Jul 31 == 01:00Z Aug 1 — still July", () => {
    expect(monthKey(new Date("2026-08-01T01:00:00.000Z"))).toBe("2026-07");
  });

  it("buckets 00:00 BRT Aug 1 into August", () => {
    expect(monthKey(new Date("2026-08-01T03:00:00.000Z"))).toBe("2026-08");
  });

  it("handles a year rollover", () => {
    expect(monthKey(new Date("2027-01-01T02:59:00.000Z"))).toBe("2026-12");
  });
});

describe("zonedTimeToUtc", () => {
  it("round-trips a BRT wall clock to the correct UTC instant", () => {
    expect(zonedTimeToUtc(2026, 7, 31, 23, 30).toISOString()).toBe(
      "2026-08-01T02:30:00.000Z",
    );
  });

  it("defaults time-of-day to midnight", () => {
    expect(zonedTimeToUtc(2026, 7, 1).toISOString()).toBe(
      "2026-07-01T03:00:00.000Z",
    );
  });
});

describe("addZonedMonths", () => {
  it("steps back across a year boundary", () => {
    expect(
      addZonedMonths(new Date("2026-01-05T10:00:00Z"), -5).toISOString(),
    ).toBe("2025-08-01T03:00:00.000Z");
  });

  it("delta=0 returns the start of the current zoned month", () => {
    expect(
      addZonedMonths(new Date("2026-08-01T01:00:00.000Z"), 0).toISOString(),
    ).toBe("2026-07-01T03:00:00.000Z");
  });
});
