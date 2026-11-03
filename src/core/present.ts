import { BUCKET_KEYS, rowBucketEffect } from "./compare";
import type { BucketKey, ComparedRow, Comparison } from "./compare";
import { Decimal, money } from "./money";
import { buildSummary, displayRoundingNotice } from "./summary";
import type { DisplayRoundingNotice, SummaryPart } from "./summary";
import type { ValidatedService } from "./validate";

type DecimalInstance = InstanceType<typeof Decimal>;

export type MoneyJson = { exact: string; display: string };

export type RowSideJson = {
  quantity: MoneyJson;
  unitPrice: MoneyJson;
  cost: MoneyJson;
};

export type RowJson = {
  service: string;
  status: ComparedRow["status"];
  buckets: BucketKey[];
  before: RowSideJson | null;
  after: RowSideJson | null;
  sources: {
    before: { fileName: string; line: number } | null;
    after: { fileName: string; line: number } | null;
  };
  usageEffect: MoneyJson;
  priceEffect: MoneyJson;
  change: MoneyJson;
};

export type CompareResponse = {
  currency: "HKD";
  totals: { before: MoneyJson; after: MoneyJson; change: MoneyJson };
  buckets: Record<
    BucketKey,
    MoneyJson & { contributors: number; from: MoneyJson; to: MoneyJson }
  >;
  summary: string;
  summaryParts: SummaryPart[];
  displayRoundingNotice: DisplayRoundingNotice | null;
  rows: RowJson[];
};

/** Quantity keeps its exact decimal text and has no currency prefix. */
function quantityJson(value: DecimalInstance): MoneyJson {
  const text = value.toFixed();
  return { exact: text, display: text };
}

function sideJson(service: ValidatedService): RowSideJson {
  return {
    quantity: quantityJson(service.quantity),
    unitPrice: money(service.unitPrice),
    cost: money(service.quantity.times(service.unitPrice)),
  };
}

function rowJson(row: ComparedRow): RowJson {
  return {
    service: row.service,
    status: row.status,
    buckets: BUCKET_KEYS.filter((key) => !rowBucketEffect(row, key).isZero()),
    before: row.before === null ? null : sideJson(row.before),
    after: row.after === null ? null : sideJson(row.after),
    sources: {
      before: row.before === null ? null : row.before.source,
      after: row.after === null ? null : row.after.source,
    },
    usageEffect: money(row.usageEffect),
    priceEffect: money(row.priceEffect),
    change: money(row.change),
  };
}

export function toCompareResponse(comparison: Comparison): CompareResponse {
  const summary = buildSummary(comparison.totalChange, comparison.buckets);
  const buckets = Object.fromEntries(
    comparison.buckets.map((bucket) => [
      bucket.key,
      {
        ...money(bucket.total),
        contributors: bucket.contributors,
        from: money(bucket.from),
        to: money(bucket.to),
      },
    ]),
  ) as CompareResponse["buckets"];

  return {
    currency: "HKD",
    totals: {
      before: money(comparison.beforeTotal),
      after: money(comparison.afterTotal),
      change: money(comparison.totalChange),
    },
    buckets,
    summary: summary.text,
    summaryParts: summary.parts,
    displayRoundingNotice: displayRoundingNotice(comparison),
    rows: comparison.rows.map(rowJson),
  };
}
