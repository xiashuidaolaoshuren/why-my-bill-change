import { describe, expect, it } from "vitest";
import { BUCKET_KEYS } from "../src/core/compare";
import type { Bucket, BucketKey, Comparison } from "../src/core/compare";
import { Decimal } from "../src/core/money";
import { buildSummary, displayRoundingNotice } from "../src/core/summary";

function buckets(
  totals: Partial<Record<BucketKey, string>> = {},
  contributors: Partial<Record<BucketKey, number>> = {},
  beforeTotal = "0",
): Bucket[] {
  let level = new Decimal(beforeTotal);
  return BUCKET_KEYS.map((key) => {
    const total = new Decimal(totals[key] ?? "0");
    const from = level;
    level = level.plus(total);
    return {
      key,
      total,
      from,
      to: level,
      contributors: contributors[key] ?? 0,
    };
  });
}

describe("buildSummary sentence grammar", () => {
  it("says the total did not change when nothing moved", () => {
    const summary = buildSummary(new Decimal("0"), buckets());
    expect(summary.text).toBe("Total did not change.");
    expect(summary.parts).toEqual([
      { type: "text", text: "Total did not change." },
    ]);
  });

  it("describes a single increase in one bucket", () => {
    const summary = buildSummary(
      new Decimal("20"),
      buckets({ added: "20" }),
    );
    expect(summary.text).toBe(
      "Total increased by HK$20.00: HK$20.00 from newly added services.",
    );
  });

  it("describes a single decrease in one bucket", () => {
    const summary = buildSummary(
      new Decimal("-20"),
      buckets({ removed: "-20" }),
    );
    expect(summary.text).toBe(
      "Total decreased by HK$20.00: HK$20.00 from removed services.",
    );
  });

  it("joins two same-direction buckets with and", () => {
    const summary = buildSummary(
      new Decimal("30"),
      buckets({ usage: "10", price: "20" }),
    );
    expect(summary.text).toBe(
      "Total increased by HK$30.00: HK$10.00 from usage changes and HK$20.00 from price changes.",
    );
  });

  it("matches the headline sentence with three buckets and an offset", () => {
    const summary = buildSummary(
      new Decimal("240"),
      buckets(
        { added: "180", usage: "60", price: "20", removed: "-20" },
        { added: 1, usage: 1, price: 1, removed: 1 },
      ),
    );
    expect(summary.text).toBe(
      "Total increased by HK$240.00: HK$180.00 from newly added services, HK$60.00 from usage changes, and HK$20.00 from price changes, partly offset by HK$20.00 from removed services.",
    );
  });

  it("describes zero change with moving buckets as an exact offset", () => {
    const summary = buildSummary(
      new Decimal("0"),
      buckets({ usage: "-10", price: "10" }),
    );
    expect(summary.text).toBe(
      "Total did not change: HK$10.00 from price changes exactly offset HK$10.00 from usage changes.",
    );
  });

  it("says less than HK$0.01 for a subcent increase", () => {
    const summary = buildSummary(
      new Decimal("0.004"),
      buckets({ added: "0.004" }),
    );
    expect(summary.text).toBe(
      "Total increased by less than HK$0.01: less than HK$0.01 from newly added services.",
    );
  });

  it("ignores buckets whose exact total is zero", () => {
    const summary = buildSummary(
      new Decimal("0"),
      buckets({ usage: "0" }, { usage: 2 }),
    );
    expect(summary.text).toBe("Total did not change.");
  });
});

describe("buildSummary parts", () => {
  it("joins its parts back into the sentence", () => {
    const summary = buildSummary(
      new Decimal("240"),
      buckets(
        { added: "180", usage: "60", price: "20", removed: "-20" },
        { added: 1, usage: 1, price: 1, removed: 1 },
      ),
    );
    expect(summary.parts.map((part) => part.text).join("")).toBe(summary.text);
  });

  it("marks amounts with the tone of their exact sign", () => {
    const summary = buildSummary(
      new Decimal("240"),
      buckets({ added: "180", removed: "-20" }),
    );
    const amounts = summary.parts.filter((part) => part.type === "amount");
    expect(amounts.map((part) => [part.text, part.tone])).toEqual([
      ["HK$240.00", "up"],
      ["HK$180.00", "up"],
      ["HK$20.00", "down"],
    ]);
  });

  it("keeps amount parts to type, text and tone", () => {
    const summary = buildSummary(new Decimal("20"), buckets({ added: "20" }));
    for (const part of summary.parts) {
      expect(Object.keys(part).sort()).toEqual(
        part.type === "amount"
          ? ["text", "tone", "type"]
          : ["text", "type"],
      );
    }
  });
});

function comparisonOf(values: {
  before: string;
  after: string;
  change: string;
  totals: Partial<Record<BucketKey, string>>;
}): Comparison {
  return {
    rows: [],
    beforeTotal: new Decimal(values.before),
    afterTotal: new Decimal(values.after),
    totalChange: new Decimal(values.change),
    buckets: buckets(values.totals),
  };
}

describe("displayRoundingNotice", () => {
  it("is null when the displayed cents agree", () => {
    const comparison = comparisonOf({
      before: "170",
      after: "410",
      change: "240",
      totals: { added: "180", usage: "60", price: "20", removed: "-20" },
    });
    expect(displayRoundingNotice(comparison)).toBeNull();
  });

  it("reports both mismatches when displayed buckets miss the displayed change", () => {
    const comparison = comparisonOf({
      before: "200",
      after: "200.008",
      change: "0.008",
      totals: { usage: "0.004", price: "0.004" },
    });
    expect(displayRoundingNotice(comparison)).toEqual({
      bucketsMismatch: true,
      waterfallMismatch: true,
      displayedBucketSum: "HK$0.00",
      displayedStepsEnd: "HK$200.00",
    });
  });

  it("reports a waterfall-only mismatch", () => {
    const comparison = comparisonOf({
      before: "0.004",
      after: "0.008",
      change: "0.004",
      totals: { added: "0.004" },
    });
    expect(displayRoundingNotice(comparison)).toEqual({
      bucketsMismatch: false,
      waterfallMismatch: true,
      displayedBucketSum: "HK$0.00",
      displayedStepsEnd: "HK$0.00",
    });
  });
});
