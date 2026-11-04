import type { BucketKey, RowStatus } from "@/core/contract";
import type { MoneyJson, RowJson } from "@/core/present";
import { compareExact, compareExactMagnitude } from "@/lib/exact-order";

export type StatusFilter = RowStatus | "all";

export type SortKey = "service" | "status" | "before" | "after" | "change";

export type SortState = {
  key: SortKey;
  dir: "asc" | "desc";
  magnitude: boolean;
};

export type StatusCounts = Record<StatusFilter, number>;

const STATUS_ORDER: Record<RowStatus, number> = {
  added: 0,
  changed: 1,
  removed: 2,
  unchanged: 3,
};

const NAME_COLLATOR = new Intl.Collator("en", {
  sensitivity: "variant",
  numeric: true,
});

export function defaultSort(bucket: BucketKey | null): SortState {
  return {
    key: "change",
    dir: "desc",
    magnitude: bucket !== null,
  };
}

export function contributionOf(row: RowJson, bucket: BucketKey): MoneyJson {
  switch (bucket) {
    case "added":
      return row.status === "added" ? row.change : zeroMoney();
    case "removed":
      return row.status === "removed" ? row.change : zeroMoney();
    case "usage":
      return row.usageEffect;
    case "price":
      return row.priceEffect;
    default:
      return zeroMoney();
  }
}

function zeroMoney(): MoneyJson {
  return { exact: "0", display: "HK$0.00" };
}

function compareNames(a: string, b: string): number {
  return NAME_COLLATOR.compare(a, b);
}

function sortValue(
  row: RowJson,
  key: SortKey,
  bucket: BucketKey | null,
): string | number | null {
  switch (key) {
    case "service":
      return null;
    case "status":
      return STATUS_ORDER[row.status];
    case "before":
      return row.before?.cost.exact ?? null;
    case "after":
      return row.after?.cost.exact ?? null;
    case "change": {
      if (bucket) return contributionOf(row, bucket).exact;
      return row.change.exact;
    }
    default:
      return null;
  }
}

function compareSortValues(
  a: string | number | null,
  b: string | number | null,
  sort: SortState,
): number {
  if (a === null && b === null) return 0;

  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  const left = String(a);
  const right = String(b);
  if (sort.key === "change" && sort.magnitude) {
    return compareExactMagnitude(left, right);
  }
  return compareExact(left, right);
}

function sortRows(
  rows: RowJson[],
  sort: SortState,
  bucket: BucketKey | null,
): RowJson[] {
  const direction = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort.key === "service") {
      return direction * compareNames(left.service, right.service);
    }

    const va = sortValue(left, sort.key, bucket);
    const vb = sortValue(right, sort.key, bucket);
    if (va !== vb && (va === null || vb === null)) {
      return va === null ? 1 : -1;
    }
    const order = compareSortValues(va, vb, sort);
    if (order !== 0) return direction * order;
    return compareNames(left.service, right.service);
  });
}

export function visibleRows(input: {
  rows: RowJson[];
  bucket: BucketKey | null;
  status: StatusFilter;
  search: string;
  sort: SortState;
}): { rows: RowJson[]; counts: StatusCounts } {
  const { rows, bucket, status, search, sort } = input;
  const query = search.trim().toLowerCase();

  let scope = bucket
    ? rows.filter((row) => row.buckets.includes(bucket))
    : rows;

  if (query) {
    scope = scope.filter((row) => row.service.toLowerCase().includes(query));
  }

  const counts: StatusCounts = {
    all: scope.length,
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
  };
  for (const row of scope) counts[row.status] += 1;

  const filtered =
    status === "all" ? scope : scope.filter((row) => row.status === status);

  return { rows: sortRows(filtered, sort, bucket), counts };
}
