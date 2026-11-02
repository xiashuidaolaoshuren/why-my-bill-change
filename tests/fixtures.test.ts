import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareBills } from "../src/core/compare";
import { toCompareResponse } from "../src/core/present";
import { validateBill } from "../src/core/validate";

function readFixture(caseName: string, fileName: string): string {
  return readFileSync(
    new URL(`./fixtures/${caseName}/${fileName}`, import.meta.url),
    "utf8",
  );
}

function runCase(caseName: string) {
  const before = validateBill({
    side: "before",
    fileName: "before.csv",
    text: readFixture(caseName, "before.csv"),
  });
  const after = validateBill({
    side: "after",
    fileName: "after.csv",
    text: readFixture(caseName, "after.csv"),
  });

  const errors = [...before.errors, ...after.errors];
  if (errors.length > 0) {
    return { errors };
  }

  return toCompareResponse(compareBills(before.services, after.services));
}

const cases = [
  "headline",
  "only-added",
  "only-removed",
  "usage-only",
  "price-only",
  "both-changing",
  "unchanged",
  "same-cost-diff-qp",
  "tiny-unit-price",
  "zero-quantity",
  "header-only",
  "max-magnitude",
  "over-limit-digits",
  "rounding-notice",
  "opposing-usage",
  "subcent-total-change",
];

describe("golden fixtures", () => {
  it.each(cases)("%s matches the hand-calculated expected.json", (caseName) => {
    const expected = JSON.parse(readFixture(caseName, "expected.json"));
    expect(runCase(caseName)).toEqual(expected);
  });
});
