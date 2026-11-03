import { describe, expect, it } from "vitest";
import type { RowJson } from "../src/core/present";
import {
  contributionOf,
  defaultSort,
  visibleRows,
} from "../src/lib/services-view";

function row(partial: Partial<RowJson> & Pick<RowJson, "service" | "status">): RowJson {
  const zero = { exact: "0", display: "HK$0.00" };
  return {
    buckets: [],
    before: null,
    after: null,
    sources: { before: null, after: null },
    usageEffect: zero,
    priceEffect: zero,
    change: zero,
    ...partial,
  };
}

describe("contributionOf", () => {
  it("maps bucket keys to the correct money fields", () => {
    const added = row({
      service: "A",
      status: "added",
      change: { exact: "5", display: "HK$5.00" },
      buckets: ["added"],
    });
    expect(contributionOf(added, "added").exact).toBe("5");

    const usage = row({
      service: "B",
      status: "changed",
      usageEffect: { exact: "60", display: "HK$60.00" },
      buckets: ["usage"],
    });
    expect(contributionOf(usage, "usage").exact).toBe("60");
  });
});

describe("visibleRows", () => {
  const rows: RowJson[] = [
    row({
      service: "Alpha",
      status: "changed",
      buckets: ["usage"],
      usageEffect: { exact: "10", display: "HK$10.00" },
      change: { exact: "10", display: "HK$10.00" },
      before: {
        quantity: { exact: "1", display: "1" },
        unitPrice: { exact: "1", display: "HK$1.00" },
        cost: { exact: "1", display: "HK$1.00" },
      },
      after: {
        quantity: { exact: "11", display: "11" },
        unitPrice: { exact: "1", display: "HK$1.00" },
        cost: { exact: "11", display: "HK$11.00" },
      },
    }),
    row({
      service: "Beta",
      status: "changed",
      buckets: ["usage"],
      usageEffect: { exact: "-10", display: "-HK$10.00" },
      change: { exact: "-10", display: "-HK$10.00" },
      before: {
        quantity: { exact: "11", display: "11" },
        unitPrice: { exact: "1", display: "HK$1.00" },
        cost: { exact: "11", display: "HK$11.00" },
      },
      after: {
        quantity: { exact: "1", display: "1" },
        unitPrice: { exact: "1", display: "HK$1.00" },
        cost: { exact: "1", display: "HK$1.00" },
      },
    }),
    row({
      service: "Gamma",
      status: "added",
      buckets: ["added"],
      change: { exact: "240", display: "HK$240.00" },
      after: {
        quantity: { exact: "1", display: "1" },
        unitPrice: { exact: "240", display: "HK$240.00" },
        cost: { exact: "240", display: "HK$240.00" },
      },
    }),
  ];

  it("keeps contributors when filtering by a zero-total bucket", () => {
    const { rows: visible } = visibleRows({
      rows,
      bucket: "usage",
      status: "all",
      search: "",
      sort: defaultSort("usage"),
    });
    expect(visible.map((r) => r.service)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts bucket contributions by absolute magnitude descending by default", () => {
    const { rows: visible } = visibleRows({
      rows,
      bucket: "usage",
      status: "all",
      search: "",
      sort: defaultSort("usage"),
    });
    expect(visible[0].service).toBe("Alpha");
    expect(visible[1].service).toBe("Beta");
  });

  it("sorts missing costs last regardless of direction", () => {
    const list = [
      row({
        service: "HasBefore",
        status: "removed",
        buckets: ["removed"],
        change: { exact: "-1", display: "-HK$1.00" },
        before: {
          quantity: { exact: "1", display: "1" },
          unitPrice: { exact: "1", display: "HK$1.00" },
          cost: { exact: "1", display: "HK$1.00" },
        },
      }),
      row({
        service: "NoBefore",
        status: "added",
        buckets: ["added"],
        change: { exact: "2", display: "HK$2.00" },
        after: {
          quantity: { exact: "1", display: "1" },
          unitPrice: { exact: "2", display: "HK$2.00" },
          cost: { exact: "2", display: "HK$2.00" },
        },
      }),
    ];
    const asc = visibleRows({
      rows: list,
      bucket: null,
      status: "all",
      search: "",
      sort: { key: "before", dir: "asc", magnitude: false },
    }).rows;
    expect(asc.map((r) => r.service)).toEqual(["HasBefore", "NoBefore"]);

    const desc = visibleRows({
      rows: list,
      bucket: null,
      status: "all",
      search: "",
      sort: { key: "before", dir: "desc", magnitude: false },
    }).rows;
    expect(desc.map((r) => r.service)).toEqual(["HasBefore", "NoBefore"]);
  });

  it("breaks ties by service name ascending", () => {
    const tied = [
      row({
        service: "Zulu",
        status: "unchanged",
        change: { exact: "0", display: "HK$0.00" },
        before: {
          quantity: { exact: "1", display: "1" },
          unitPrice: { exact: "1", display: "HK$1.00" },
          cost: { exact: "1", display: "HK$1.00" },
        },
        after: {
          quantity: { exact: "1", display: "1" },
          unitPrice: { exact: "1", display: "HK$1.00" },
          cost: { exact: "1", display: "HK$1.00" },
        },
      }),
      row({
        service: "Alpha",
        status: "unchanged",
        change: { exact: "0", display: "HK$0.00" },
        before: {
          quantity: { exact: "1", display: "1" },
          unitPrice: { exact: "1", display: "HK$1.00" },
          cost: { exact: "1", display: "HK$1.00" },
        },
        after: {
          quantity: { exact: "1", display: "1" },
          unitPrice: { exact: "1", display: "HK$1.00" },
          cost: { exact: "1", display: "HK$1.00" },
        },
      }),
    ];
    const { rows: visible } = visibleRows({
      rows: tied,
      bucket: null,
      status: "all",
      search: "",
      sort: { key: "change", dir: "desc", magnitude: false },
    });
    expect(visible.map((r) => r.service)).toEqual(["Alpha", "Zulu"]);
  });
});
