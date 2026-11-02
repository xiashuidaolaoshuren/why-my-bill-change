import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertReconciliation, BUCKET_KEYS, compareBills } from "../src/core/compare";
import type { Bucket, BucketKey, Comparison } from "../src/core/compare";
import { Decimal } from "../src/core/money";
import type { ValidatedService } from "../src/core/validate";

function svc(
  service: string,
  quantity: string,
  unitPrice: string,
  line: number,
  fileName = "before.csv",
): ValidatedService {
  return {
    service,
    quantity: new Decimal(quantity),
    unitPrice: new Decimal(unitPrice),
    source: { fileName, line },
  };
}

const digitRun = (maxLength: number) =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength })
    .map((digits) => digits.join("").replace(/^0+(?=\d)/, ""));

const decimalText = fc
  .tuple(digitRun(12), fc.option(digitRun(12), { nil: undefined }))
  .map(([whole, fraction]) =>
    fraction === undefined ? whole : `${whole}.${fraction}`,
  );

const names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"] as const;

const billArbitrary = fc
  .array(fc.tuple(decimalText, decimalText), { minLength: 0, maxLength: 5 })
  .map((values) =>
    values.map(([quantity, unitPrice], index) =>
      svc(names[index], quantity, unitPrice, index + 2),
    ),
  );

describe("compareBills statuses and effects", () => {
  it("classifies added, removed, changed and unchanged services", () => {
    const before = [
      svc("Alpha", "10", "1", 2),
      svc("Beta", "5", "2", 3),
      svc("Gamma", "3", "1", 4),
    ];
    const after = [
      svc("Alpha", "10", "1", 2, "after.csv"),
      svc("Beta", "6", "2", 3, "after.csv"),
      svc("Delta", "4", "1", 4, "after.csv"),
    ];

    const comparison = compareBills(before, after);
    expect(comparison.rows.map((row) => [row.service, row.status])).toEqual([
      ["Alpha", "unchanged"],
      ["Beta", "changed"],
      ["Gamma", "removed"],
      ["Delta", "added"],
    ]);
  });

  it("computes usage and price effects for a changed service", () => {
    const comparison = compareBills(
      [svc("Compute", "100", "0.1", 2)],
      [svc("Compute", "120", "0.12", 2, "after.csv")],
    );

    const [row] = comparison.rows;
    expect(row.usageEffect.toFixed()).toBe("2");
    expect(row.priceEffect.toFixed()).toBe("2.4");
    expect(row.change.toFixed()).toBe("4.4");
  });

  it("gives added and removed services one-sided effects", () => {
    const comparison = compareBills(
      [svc("Legacy", "20", "1", 2)],
      [svc("Support", "3", "2", 2, "after.csv")],
    );

    const [removed, added] = comparison.rows;
    expect(removed.status).toBe("removed");
    expect(removed.change.toFixed()).toBe("-20");
    expect(removed.usageEffect.isZero()).toBe(true);
    expect(removed.priceEffect.isZero()).toBe(true);

    expect(added.status).toBe("added");
    expect(added.change.toFixed()).toBe("6");
    expect(added.usageEffect.isZero()).toBe(true);
    expect(added.priceEffect.isZero()).toBe(true);
  });

  it("keeps before-file order, then added services in after-file order", () => {
    const comparison = compareBills(
      [svc("Zeta", "1", "1", 2), svc("Alpha", "1", "1", 3)],
      [
        svc("Alpha", "1", "1", 2, "after.csv"),
        svc("Beta", "1", "1", 3, "after.csv"),
        svc("Gamma", "1", "1", 4, "after.csv"),
      ],
    );
    expect(comparison.rows.map((row) => row.service)).toEqual([
      "Zeta",
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("keeps usage + price equal to the change for every changed row", () => {
    fc.assert(
      fc.property(billArbitrary, billArbitrary, (before, after) => {
        for (const row of compareBills(before, after).rows) {
          if (row.status !== "changed") continue;
          expect(row.usageEffect.plus(row.priceEffect).equals(row.change)).toBe(
            true,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

const zero = () => new Decimal("0");
const bucketByKey = (comparison: Comparison, key: string) => {
  const bucket = comparison.buckets.find((b) => b.key === key);
  if (!bucket) throw new Error(`Missing bucket ${key}`);
  return bucket;
};

function headlinePair() {
  const before = [
    svc("Compute", "100", "1", 2),
    svc("Storage", "50", "1", 3),
    svc("Legacy", "20", "1", 4),
  ];
  const after = [
    svc("Compute", "160", "1", 2, "after.csv"),
    svc("Storage", "50", "1.4", 3, "after.csv"),
    svc("Support", "180", "1", 4, "after.csv"),
  ];
  return { before, after };
}

describe("compareBills totals, buckets and contributors", () => {
  it("computes bill totals and the four bucket totals", () => {
    const { before, after } = headlinePair();
    const comparison = compareBills(before, after);

    expect(comparison.beforeTotal.toFixed()).toBe("170");
    expect(comparison.afterTotal.toFixed()).toBe("410");
    expect(comparison.totalChange.toFixed()).toBe("240");

    expect(comparison.buckets.map((b) => b.key)).toEqual([
      "added",
      "usage",
      "price",
      "removed",
    ]);
    expect(bucketByKey(comparison, "added").total.toFixed()).toBe("180");
    expect(bucketByKey(comparison, "usage").total.toFixed()).toBe("60");
    expect(bucketByKey(comparison, "price").total.toFixed()).toBe("20");
    expect(bucketByKey(comparison, "removed").total.toFixed()).toBe("-20");
    for (const bucket of comparison.buckets) {
      expect(bucket.contributors).toBe(1);
    }
  });

  it("keeps a zero-total bucket with two contributors", () => {
    const comparison = compareBills(
      [svc("Compute", "200", "1", 2), svc("Storage", "300", "1", 3)],
      [
        svc("Compute", "300", "1", 2, "after.csv"),
        svc("Storage", "200", "1", 3, "after.csv"),
      ],
    );
    const usage = bucketByKey(comparison, "usage");
    expect(usage.total.isZero()).toBe(true);
    expect(usage.contributors).toBe(2);
  });

  it("keeps the reconciliation identity for any accepted bill pair", () => {
    fc.assert(
      fc.property(billArbitrary, billArbitrary, (before, after) => {
        const comparison = compareBills(before, after);
        const bucketSum = comparison.buckets.reduce(
          (total, bucket) => total.plus(bucket.total),
          zero(),
        );
        expect(
          comparison.beforeTotal.plus(bucketSum).equals(comparison.afterTotal),
        ).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("counts a contributor only when the exact effect is non-zero", () => {
    fc.assert(
      fc.property(billArbitrary, billArbitrary, (before, after) => {
        const comparison = compareBills(before, after);
        for (const bucket of comparison.buckets) {
          const effects = comparison.rows.map((row) => {
            switch (bucket.key) {
              case "added":
                return row.status === "added" ? row.change : zero();
              case "removed":
                return row.status === "removed" ? row.change : zero();
              case "usage":
                return row.usageEffect;
              default:
                return row.priceEffect;
            }
          });
          expect(bucket.contributors).toBe(
            effects.filter((effect) => !effect.isZero()).length,
          );
          expect(
            bucket.total.equals(effects.reduce((t, e) => t.plus(e), zero())),
          ).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("produces the same aggregates and effects whatever the row order", () => {
    fc.assert(
      fc.property(billArbitrary, billArbitrary, (before, after) => {
        const forward = compareBills(before, after);
        const reversed = compareBills(
          [...before].reverse(),
          [...after].reverse(),
        );

        expect(reversed.beforeTotal.equals(forward.beforeTotal)).toBe(true);
        expect(reversed.afterTotal.equals(forward.afterTotal)).toBe(true);
        expect(reversed.totalChange.equals(forward.totalChange)).toBe(true);
        for (const bucket of forward.buckets) {
          const other = bucketByKey(reversed, bucket.key);
          expect(other.total.equals(bucket.total)).toBe(true);
          expect(other.contributors).toBe(bucket.contributors);
        }

        const effectsByService = (comparison: Comparison) =>
          new Map(
            comparison.rows.map((row) => [
              row.service,
              [
                row.status,
                row.usageEffect.toFixed(),
                row.priceEffect.toFixed(),
                row.change.toFixed(),
              ],
            ]),
          );
        expect(effectsByService(reversed)).toEqual(
          effectsByService(forward),
        );
      }),
      { numRuns: 150 },
    );
  });

  it("negates the total change when the bills are swapped", () => {
    fc.assert(
      fc.property(billArbitrary, billArbitrary, (before, after) => {
        expect(
          compareBills(before, after)
            .totalChange.plus(compareBills(after, before).totalChange)
            .isZero(),
        ).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});

describe("assertReconciliation", () => {
  const bucketsWith = (key: BucketKey, total: string): Bucket[] =>
    BUCKET_KEYS.map((bucketKey) => ({
      key: bucketKey,
      total: new Decimal(bucketKey === key ? total : "0"),
      contributors: bucketKey === key ? 1 : 0,
    }));

  it("throws when the before total plus buckets misses the after total", () => {
    expect(() =>
      assertReconciliation(new Decimal("10"), bucketsWith("added", "5"), new Decimal("20")),
    ).toThrow(/Reconciliation failed:/);
  });

  it("accepts a triple that reconciles exactly", () => {
    expect(() =>
      assertReconciliation(
        new Decimal("10"),
        bucketsWith("added", "10"),
        new Decimal("20"),
      ),
    ).not.toThrow();
  });
});
