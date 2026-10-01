import { describe, expect, it } from "vitest";
import { countAxisMax, niceMax } from "./chart-kit";

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
