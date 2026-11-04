export type RowStatus = "added" | "removed" | "changed" | "unchanged";

export type BucketKey = "added" | "usage" | "price" | "removed";

export const BUCKET_KEYS: readonly BucketKey[] = [
  "added",
  "usage",
  "price",
  "removed",
];

export type Tone = "up" | "down" | "flat";
