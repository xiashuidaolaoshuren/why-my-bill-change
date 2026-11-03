import { describe, expect, it } from "vitest";
import {
  absExact,
  compareExact,
  compareExactMagnitude,
} from "../src/lib/exact-order";

describe("compareExact", () => {
  it("orders negative, zero, fractional, and positive values", () => {
    const ordered = ["-20", "0", "0.004", "0.01", "10", "240"];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      expect(compareExact(ordered[i], ordered[i + 1])).toBeLessThan(0);
      expect(compareExact(ordered[i + 1], ordered[i])).toBeGreaterThan(0);
    }
  });

  it("treats equivalent decimal forms as equal", () => {
    expect(compareExact("1.0", "1.00")).toBe(0);
    expect(compareExact("-0", "0")).toBe(0);
    expect(compareExact("+10", "010")).toBe(0);
  });

  it("orders negative fractions correctly", () => {
    expect(compareExact("-0.5", "-0.25")).toBeLessThan(0);
  });

  it("compares very long digit strings without floating point", () => {
    const twelve = "9".repeat(12);
    const shorter = "1" + "0".repeat(11);
    expect(compareExact(twelve, shorter)).toBeGreaterThan(0);
    expect(compareExact(`${twelve}.5`, `${twelve}.49`)).toBeGreaterThan(0);
  });
});

describe("absExact", () => {
  it("strips sign and normalizes zero", () => {
    expect(absExact("-3.5")).toBe("3.5");
    expect(absExact("-0")).toBe("0");
    expect(absExact("0.00")).toBe("0");
  });
});

describe("compareExactMagnitude", () => {
  it("compares absolute values", () => {
    expect(compareExactMagnitude("-20", "10")).toBeGreaterThan(0);
    expect(compareExactMagnitude("-0.5", "0.25")).toBeGreaterThan(0);
    expect(compareExactMagnitude("3", "-3")).toBe(0);
  });
});
