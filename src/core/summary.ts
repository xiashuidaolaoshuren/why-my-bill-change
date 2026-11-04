import type { Bucket, Comparison } from "./compare";
import type { BucketKey, Tone } from "./contract";
import { Decimal, money } from "./money";

export type { Tone } from "./contract";

type DecimalInstance = InstanceType<typeof Decimal>;

export type SummaryPart =
  | { type: "text"; text: string }
  | { type: "amount"; text: string; tone: Tone };

const PHRASES: Record<BucketKey, string> = {
  added: "from newly added services",
  usage: "from usage changes",
  price: "from price changes",
  removed: "from removed services",
};

function toneOf(value: DecimalInstance): Tone {
  if (value.isZero()) return "flat";
  return value.isPositive() ? "up" : "down";
}

function amountPhrase(value: DecimalInstance): string {
  const magnitude = value.abs();
  const cents = magnitude.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!value.isZero() && cents.isZero()) return "less than HK$0.01";
  return money(magnitude).display;
}

export function buildSummary(
  totalChange: DecimalInstance,
  buckets: Bucket[],
): { text: string; parts: SummaryPart[] } {
  const parts: SummaryPart[] = [];

  const text = (value: string) => {
    parts.push({ type: "text", text: value });
  };
  const amount = (value: DecimalInstance) => {
    parts.push({
      type: "amount",
      text: amountPhrase(value),
      tone: toneOf(value),
    });
  };
  const list = (items: Bucket[]) => {
    items.forEach((bucket, index) => {
      if (index > 0) {
        text(
          items.length === 2
            ? " and "
            : index === items.length - 1
              ? ", and "
              : ", ",
        );
      }
      amount(bucket.total);
      text(` ${PHRASES[bucket.key]}`);
    });
  };

  const moving = buckets.filter((bucket) => !bucket.total.isZero());

  if (totalChange.isZero()) {
    if (moving.length === 0) {
      text("Total did not change.");
    } else {
      text("Total did not change: ");
      list(moving.filter((bucket) => bucket.total.isPositive()));
      text(" exactly offset ");
      list(moving.filter((bucket) => bucket.total.isNegative()));
      text(".");
    }
  } else {
    const rising = totalChange.isPositive();
    text(`Total ${rising ? "increased" : "decreased"} by `);
    amount(totalChange);
    text(": ");
    list(
      moving.filter((bucket) => bucket.total.isPositive() === rising),
    );
    const offsets = moving.filter(
      (bucket) => bucket.total.isPositive() !== rising,
    );
    if (offsets.length > 0) {
      text(", partly offset by ");
      list(offsets);
    }
    text(".");
  }

  return { text: parts.map((part) => part.text).join(""), parts };
}

export type DisplayRoundingNotice = {
  bucketsMismatch: boolean;
  waterfallMismatch: boolean;
  displayedBucketSum: string;
  displayedStepsEnd: string;
};

function centsOf(value: DecimalInstance): DecimalInstance {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Compares displayed cents, which are rounded independently and may not add up. */
export function displayRoundingNotice(
  comparison: Comparison,
): DisplayRoundingNotice | null {
  const displayedBucketSum = comparison.buckets.reduce(
    (total, bucket) => total.plus(centsOf(bucket.total)),
    new Decimal("0"),
  );
  const displayedStepsEnd = centsOf(comparison.beforeTotal).plus(
    displayedBucketSum,
  );

  const bucketsMismatch = !displayedBucketSum.equals(
    centsOf(comparison.totalChange),
  );
  const waterfallMismatch = !displayedStepsEnd.equals(
    centsOf(comparison.afterTotal),
  );

  if (!bucketsMismatch && !waterfallMismatch) return null;

  return {
    bucketsMismatch,
    waterfallMismatch,
    displayedBucketSum: money(displayedBucketSum).display,
    displayedStepsEnd: money(displayedStepsEnd).display,
  };
}
