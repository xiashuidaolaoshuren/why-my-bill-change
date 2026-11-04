import type { BucketKey, Tone } from "@/core/contract";
import { BUCKET_KEYS } from "@/core/contract";
import type { MoneyJson } from "@/core/present";

export const BUCKET_LABELS: Record<BucketKey, string> = {
  added: "Added",
  usage: "Usage",
  price: "Price",
  removed: "Removed",
};

export const BUCKET_ENTRIES = BUCKET_KEYS.map((key) => ({
  key,
  label: BUCKET_LABELS[key],
}));

/** The amount in `display` is rounded to the cent; `exact` may carry more digits. */
export function isCentExact(value: MoneyJson): boolean {
  const strip = (text: string) => {
    const clean = text.replace("HK$", "").replace(/,/g, "");
    const [whole, fraction] = clean.split(".");
    if (!fraction) return whole;
    const trimmed = fraction.replace(/0+$/, "");
    const result = trimmed ? `${whole}.${trimmed}` : whole;
    return result === "-0" ? "0" : result;
  };
  return strip(value.exact) === strip(value.display);
}

export function toneOfExact(exact: string): Tone {
  const magnitude = exact.replace("-", "");
  if (/^[0.]+$/.test(magnitude)) return "flat";
  return exact.startsWith("-") ? "down" : "up";
}

/** Currency-prefixed exact text: `HK$170`, `-HK$0.004`. No separators, no rounding. */
export function exactText(value: MoneyJson): string {
  return value.exact.startsWith("-")
    ? `-HK$${value.exact.slice(1)}`
    : `HK$${value.exact}`;
}
