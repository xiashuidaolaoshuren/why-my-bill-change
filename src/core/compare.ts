import { Decimal } from "./money";
import type { ValidatedService } from "./validate";

type DecimalInstance = InstanceType<typeof Decimal>;

export type RowStatus = "added" | "removed" | "changed" | "unchanged";

export type BucketKey = "added" | "usage" | "price" | "removed";

export const BUCKET_KEYS: readonly BucketKey[] = [
  "added",
  "usage",
  "price",
  "removed",
];

export type ComparedRow = {
  service: string;
  status: RowStatus;
  before: ValidatedService | null;
  after: ValidatedService | null;
  usageEffect: DecimalInstance;
  priceEffect: DecimalInstance;
  change: DecimalInstance;
};

export type Bucket = {
  key: BucketKey;
  total: DecimalInstance;
  from: DecimalInstance;
  to: DecimalInstance;
  contributors: number;
};

export type Comparison = {
  rows: ComparedRow[];
  beforeTotal: DecimalInstance;
  afterTotal: DecimalInstance;
  totalChange: DecimalInstance;
  buckets: Bucket[];
};

const zero = (): DecimalInstance => new Decimal("0");

/** Keeps exact strings free of a signed zero. */
function normalized(value: DecimalInstance): DecimalInstance {
  return value.isZero() ? zero() : value;
}

function cost(service: ValidatedService): DecimalInstance {
  return service.quantity.times(service.unitPrice);
}

function compareRow(
  service: string,
  before: ValidatedService | null,
  after: ValidatedService | null,
): ComparedRow {
  if (before === null && after !== null) {
    return {
      service,
      status: "added",
      before,
      after,
      usageEffect: zero(),
      priceEffect: zero(),
      change: normalized(cost(after)),
    };
  }

  if (before !== null && after === null) {
    return {
      service,
      status: "removed",
      before,
      after,
      usageEffect: zero(),
      priceEffect: zero(),
      change: normalized(cost(before).negated()),
    };
  }

  if (before !== null && after !== null) {
    const unchanged =
      before.quantity.equals(after.quantity) &&
      before.unitPrice.equals(after.unitPrice);

    if (unchanged) {
      return {
        service,
        status: "unchanged",
        before,
        after,
        usageEffect: zero(),
        priceEffect: zero(),
        change: zero(),
      };
    }

    return {
      service,
      status: "changed",
      before,
      after,
      usageEffect: normalized(
        after.quantity.minus(before.quantity).times(before.unitPrice),
      ),
      priceEffect: normalized(
        after.unitPrice.minus(before.unitPrice).times(after.quantity),
      ),
      change: normalized(cost(after).minus(cost(before))),
    };
  }

  throw new Error(`Service "${service}" is present in neither bill.`);
}

export function rowBucketEffect(
  row: ComparedRow,
  key: BucketKey,
): DecimalInstance {
  switch (key) {
    case "added":
      return row.status === "added" ? row.change : zero();
    case "removed":
      return row.status === "removed" ? row.change : zero();
    case "usage":
      return row.usageEffect;
    case "price":
      return row.priceEffect;
  }
}

export function assertReconciliation(
  beforeTotal: DecimalInstance,
  buckets: Bucket[],
  afterTotal: DecimalInstance,
): void {
  const reached = buckets.reduce(
    (total, bucket) => total.plus(bucket.total),
    beforeTotal,
  );
  if (!reached.equals(afterTotal)) {
    throw new Error(
      "Reconciliation failed: the before total plus the buckets does not reach the after total.",
    );
  }
}

export function compareBills(
  before: ValidatedService[],
  after: ValidatedService[],
): Comparison {
  const beforeByName = new Map(before.map((s) => [s.service, s]));
  const afterByName = new Map(after.map((s) => [s.service, s]));

  const orderedNames = [
    ...before.map((s) => s.service),
    ...after.map((s) => s.service).filter((name) => !beforeByName.has(name)),
  ];

  const rows = orderedNames.map((name) =>
    compareRow(name, beforeByName.get(name) ?? null, afterByName.get(name) ?? null),
  );

  const sum = (services: ValidatedService[]) =>
    services.reduce((total, service) => total.plus(cost(service)), zero());

  const beforeTotal = normalized(sum(before));
  const afterTotal = normalized(sum(after));
  const totalChange = normalized(afterTotal.minus(beforeTotal));

  let level = beforeTotal;
  const buckets = BUCKET_KEYS.map((key) => {
    const effects = rows.map((row) => rowBucketEffect(row, key));
    const total = normalized(
      effects.reduce((sum, effect) => sum.plus(effect), zero()),
    );
    const from = level;
    level = normalized(level.plus(total));
    return {
      key,
      total,
      from,
      to: level,
      contributors: effects.filter((effect) => !effect.isZero()).length,
    };
  });

  assertReconciliation(beforeTotal, buckets, afterTotal);

  return { rows, beforeTotal, afterTotal, totalChange, buckets };
}
