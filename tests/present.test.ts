import { describe, expect, it } from "vitest";
import { compareBills } from "../src/core/compare";
import { Decimal } from "../src/core/money";
import { toCompareResponse } from "../src/core/present";
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

function headline() {
  return compareBills(
    [
      svc("Compute", "100", "1", 2),
      svc("Storage", "50", "1", 3),
      svc("Legacy", "20", "1", 4),
    ],
    [
      svc("Compute", "160", "1", 2, "after.csv"),
      svc("Storage", "50", "1.4", 3, "after.csv"),
      svc("Support", "180", "1", 4, "after.csv"),
    ],
  );
}

describe("toCompareResponse", () => {
  it("maps totals, buckets and the summary to the contract", () => {
    const response = toCompareResponse(headline());

    expect(response.currency).toBe("HKD");
    expect(response.totals).toEqual({
      before: { exact: "170", display: "HK$170.00" },
      after: { exact: "410", display: "HK$410.00" },
      change: { exact: "240", display: "HK$240.00" },
    });
    expect(response.buckets.added).toEqual({
      exact: "180",
      display: "HK$180.00",
      contributors: 1,
      from: { exact: "170", display: "HK$170.00" },
      to: { exact: "350", display: "HK$350.00" },
    });
    expect(response.buckets.removed).toEqual({
      exact: "-20",
      display: "-HK$20.00",
      contributors: 1,
      from: { exact: "430", display: "HK$430.00" },
      to: { exact: "410", display: "HK$410.00" },
    });
    expect(response.summary).toBe(
      "Total increased by HK$240.00: HK$180.00 from newly added services, HK$60.00 from usage changes, and HK$20.00 from price changes, partly offset by HK$20.00 from removed services.",
    );
    expect(response.summaryParts.map((part) => part.text).join("")).toBe(
      response.summary,
    );
    expect(response.displayRoundingNotice).toBeNull();
  });

  it("keeps quantity displays as plain text without a currency prefix", () => {
    const response = toCompareResponse(
      compareBills(
        [svc("Storage", "50", "1", 2)],
        [svc("Storage", "50", "1.4", 2, "after.csv")],
      ),
    );
    const [row] = response.rows;
    expect(row.after?.quantity).toEqual({ exact: "50", display: "50" });
    expect(row.after?.unitPrice).toEqual({
      exact: "1.4",
      display: "HK$1.40",
    });
    expect(row.after?.cost).toEqual({ exact: "70", display: "HK$70.00" });
  });

  it("lists only the row buckets with a non-zero exact effect", () => {
    const response = toCompareResponse(
      compareBills(
        [svc("Compute", "100", "0.1", 2)],
        [svc("Compute", "120", "0.12", 2, "after.csv")],
      ),
    );
    expect(response.rows[0].buckets).toEqual(["usage", "price"]);
  });

  it("nulls the missing side and its source", () => {
    const response = toCompareResponse(headline());
    const added = response.rows.find((row) => row.service === "Support");
    const removed = response.rows.find((row) => row.service === "Legacy");

    expect(added?.before).toBeNull();
    expect(added?.sources).toEqual({
      before: null,
      after: { fileName: "after.csv", line: 4 },
    });
    expect(removed?.after).toBeNull();
    expect(removed?.sources).toEqual({
      before: { fileName: "before.csv", line: 4 },
      after: null,
    });
  });

  it("maps the row effects as money objects", () => {
    const response = toCompareResponse(headline());
    expect(response.rows[0]).toMatchObject({
      service: "Compute",
      status: "changed",
      usageEffect: { exact: "60", display: "HK$60.00" },
      priceEffect: { exact: "0", display: "HK$0.00" },
      change: { exact: "60", display: "HK$60.00" },
    });
  });
});
