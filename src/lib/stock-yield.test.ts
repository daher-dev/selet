import { describe, expect, it } from "vitest";
import { expectedUses, lastPackageNote, yieldPercent } from "./stock-yield";

describe("expectedUses", () => {
  it("divides the package by the average amount a recipe takes per use", () => {
    expect(expectedUses(550, [30, 30, 30])).toBe(18);
    expect(expectedUses(550, [20, 40])).toBe(18);
  });
  it("is unknown without a package size or recipe amounts", () => {
    expect(expectedUses(undefined, [30])).toBeUndefined();
    expect(expectedUses(550, [])).toBeUndefined();
    expect(expectedUses(550, [0])).toBeUndefined();
  });
  it("never predicts less than one use", () => {
    expect(expectedUses(10, [500])).toBe(1);
  });
});

describe("yieldPercent / lastPackageNote", () => {
  it("rounds actual over expected", () => {
    expect(yieldPercent(14, 18)).toBe(78);
    expect(yieldPercent(18, 18)).toBe(100);
    expect(yieldPercent(3, undefined)).toBeUndefined();
  });
  it("builds the ledger note, dropping the percent when there is no forecast", () => {
    expect(lastPackageNote(14, 18)).toBe("Pote anterior rendeu 14 usos (78%)");
    expect(lastPackageNote(1, undefined)).toBe("Pote anterior rendeu 1 uso");
    expect(lastPackageNote(undefined, 18)).toBeUndefined();
  });
});
