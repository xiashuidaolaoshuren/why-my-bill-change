import { Fragment } from "react";
import type { CompareResponse, MoneyJson } from "@/core/present";
import type { Tone } from "@/core/contract";

/**
 * Headline pieces of the result view. Every figure comes from the API as a
 * string: the browser never does money math, so "exact" and "tone" are read
 * from the payload rather than recomputed from a Number.
 */

const BUCKETS = [
  { key: "added", label: "Added" },
  { key: "usage", label: "Usage" },
  { key: "price", label: "Price" },
  { key: "removed", label: "Removed" },
] as const;

const ICON_PATHS: Record<string, string[]> = {
  up: ["M8 13V3.5M4 7.5 8 3.5l4 4"],
  down: ["M8 3v9.5M4 8.5l4 4 4-4"],
  flat: ["M3.5 6.5h9M3.5 9.5h9"],
  alert: ["M8 2.5 14 13.5H2Z", "M8 6.75v3", "M8 11.6v.15"],
  check: ["M3 8.5 6.5 12 13 4.5"],
};

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      className="od-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

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

const DIRECTION_LABEL: Record<Tone, string> = {
  up: "Bill increased",
  down: "Bill decreased",
  flat: "Bill did not change",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function SummarySentence({ parts }: { parts: CompareResponse["summaryParts"] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "amount" ? (
          <span key={index} className={`sum-amount tone-${part.tone}`}>
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Figure({ children }: { children: string }) {
  return <span className="figure">{children}</span>;
}

export function RoundingNotice({ result }: { result: CompareResponse }) {
  const rounding = result.displayRoundingNotice;
  if (rounding === null) return null;

  return (
    <div className="notice" role="note">
      <p className="notice-title">
        <Icon name="alert" />
        <span>Display rounding</span>
      </p>
      <p className="notice-body">
        {rounding.bucketsMismatch ? (
          <>
            The displayed Buckets add up to{" "}
            <Figure>{rounding.displayedBucketSum}</Figure>, but the displayed Total
            change is <Figure>{result.totals.change.display}</Figure>.{" "}
          </>
        ) : null}
        {rounding.waterfallMismatch ? (
          <>
            Stepping through the displayed waterfall from{" "}
            <Figure>{result.totals.before.display}</Figure> reaches{" "}
            <Figure>{rounding.displayedStepsEnd}</Figure>, not the displayed after
            total of <Figure>{result.totals.after.display}</Figure>.{" "}
          </>
        ) : null}
        Each amount is rounded to the cent on its own. The exact values still
        reconcile: hover a bar or expand a row to see them.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: MoneyJson;
  meta: string;
  tone?: Tone;
}) {
  return (
    <div className={tone ? `stat stat-change tone-${tone}` : "stat"}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">
        {tone ? (
          <span className="stat-icon">
            <Icon name={tone} />
          </span>
        ) : null}
        <span>{value.display}</span>
      </p>
      <p className="stat-meta">{meta}</p>
      {isCentExact(value) ? null : (
        <p className="stat-exact">Exact {exactText(value)}</p>
      )}
    </div>
  );
}

export function Stats({
  result,
  fileNames,
}: {
  result: CompareResponse;
  fileNames: { before: string; after: string };
}) {
  const changeTone = toneOfExact(result.totals.change.exact);
  const beforeCount = result.rows.filter((row) => row.before !== null).length;
  const afterCount = result.rows.filter((row) => row.after !== null).length;

  return (
    <section className="stats" aria-label="Bill totals">
      <StatCard
        label="Before total"
        value={result.totals.before}
        meta={`${plural(beforeCount, "Service")} · ${fileNames.before}`}
      />
      <StatCard
        label="After total"
        value={result.totals.after}
        meta={`${plural(afterCount, "Service")} · ${fileNames.after}`}
      />
      <StatCard
        label="Total change"
        value={result.totals.change}
        meta={DIRECTION_LABEL[changeTone]}
        tone={changeTone}
      />
    </section>
  );
}

export function Reconciliation({ result }: { result: CompareResponse }) {
  const spoken = `Before total ${exactText(result.totals.before)}, ${BUCKETS.map(
    (bucket) => `${bucket.label} ${exactText(result.buckets[bucket.key])}`,
  ).join(", ")}, equals after total ${exactText(result.totals.after)}.`;

  return (
    <section className="reconciliation" aria-label="Reconciliation, exact values">
      <p className="label">Reconciliation, exact values</p>
      <p className="rec-equation" aria-label={spoken}>
        <span className="rec-term">
          <span className="rec-name">Before total</span>
          <span className="rec-value">{exactText(result.totals.before)}</span>
        </span>
        {BUCKETS.map((bucket) => (
          <Fragment key={bucket.key}>
            <span className="rec-op" aria-hidden="true">
              +
            </span>
            <span className="rec-term">
              <span className="rec-name">{bucket.label}</span>
              <span className="rec-value">
                {exactText(result.buckets[bucket.key])}
              </span>
            </span>
          </Fragment>
        ))}
        <span className="rec-op" aria-hidden="true">
          =
        </span>
        <span className="rec-term">
          <span className="rec-name">After total</span>
          <span className="rec-value">{exactText(result.totals.after)}</span>
        </span>
      </p>
      <p className="rec-status">
        <Icon name="check" />
        <span>
          Holds exactly: before total plus every Bucket equals the after total.
        </span>
      </p>
    </section>
  );
}
