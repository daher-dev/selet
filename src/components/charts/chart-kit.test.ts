import { describe, expect, it } from "vitest";
import { countAxisMax, monthTitle, niceMax, toggleSeries, tooltipLeft } from "./chart-kit";

describe("countAxisMax", () => {
  it("keeps every tick a distinct whole number", () => {
    expect(niceMax(1, 3)).toBe(1.5); // what produced 0, 1, 1, 2
    for (const [max, steps] of [[0, 3], [1, 3], [2, 3], [7, 3], [59, 3], [1, 2], [57, 2]]) {
      const top = countAxisMax(max, steps);
      expect(Number.isInteger(top / steps)).toBe(true);
      expect(top).toBeGreaterThanOrEqual(max);
    }
    expect(countAxisMax(1, 3)).toBe(3);
  });
});

describe("toggleSeries", () => {
  const all = ["a", "b", "c"] as const;

  it("hides and re-shows a series", () => {
    const hidden = toggleSeries(new Set<string>(), "a", all);
    expect([...hidden]).toEqual(["a"]);
    expect(toggleSeries(hidden, "a", all).size).toBe(0);
  });

  it("never hides the last visible series", () => {
    const two = toggleSeries(toggleSeries(new Set<string>(), "a", all), "b", all);
    expect([...two].sort()).toEqual(["a", "b"]);
    expect(toggleSeries(two, "c", all)).toBe(two);
  });
});

describe("tooltipLeft", () => {
  it("prefers the right of the anchor", () => {
    expect(tooltipLeft(50, 100, 400)).toBe(62);
  });

  it("flips to the left near the right edge", () => {
    expect(tooltipLeft(380, 100, 400)).toBe(268);
  });

  it("clamps to the frame when neither side has room", () => {
    expect(tooltipLeft(120, 200, 240)).toBe(0); // flipped left would be -92
    expect(tooltipLeft(10, 300, 240)).toBe(0); // wider than the frame
  });
});

describe("monthTitle", () => {
  it("spells out the month and year in pt-BR", () => {
    expect(monthTitle("2026-03")).toBe("Março de 2026");
    expect(monthTitle("2026-12")).toBe("Dezembro de 2026");
  });
});
