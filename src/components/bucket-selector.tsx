"use client";

import { useRef, type RefObject } from "react";
import { exactText, isCentExact, toneOfExact } from "@/components/headline";
import { BUCKET_KEYS, type BucketKey, type Tone } from "@/core/contract";
import type { CompareResponse } from "@/core/present";

const BUCKET_LABELS: Record<BucketKey, string> = {
  added: "Added",
  usage: "Usage",
  price: "Price",
  removed: "Removed",
};

const ICON_PATHS: Record<Tone, string[]> = {
  up: ["M8 13V3.5M4 7.5 8 3.5l4 4"],
  down: ["M8 3v9.5M4 8.5l4 4 4-4"],
  flat: ["M3.5 6.5h9M3.5 9.5h9"],
};

function ChipIcon({ tone }: { tone: Tone }) {
  return (
    <svg
      className="od-icon chip-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[tone].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function BucketSelector({
  result,
  selected,
  onSelect,
  onClear,
  chipRefs,
}: {
  result: CompareResponse;
  selected: BucketKey | null;
  onSelect: (key: BucketKey) => void;
  onClear: () => void;
  chipRefs: RefObject<Partial<Record<BucketKey, HTMLButtonElement | null>>>;
}) {
  const clearRef = useRef<HTMLButtonElement>(null);

  const selectable = BUCKET_KEYS.filter((key) => result.buckets[key].contributors > 0);
  const idle = BUCKET_KEYS.filter((key) => result.buckets[key].contributors === 0);

  let note = "";
  if (selectable.length === 0) {
    note =
      "No Bucket has Contributors: every Service has the same Quantity and unit price in both bills.";
  } else if (idle.length > 0) {
    note = `No Contributors in ${joinList(idle.map((key) => BUCKET_LABELS[key]))}.`;
  }

  return (
    <div className="bucket-bar">
      <div className="bucket-bar-head">
        <h3 className="label" id="bucket-title">
          Buckets
        </h3>
        <button
          ref={clearRef}
          type="button"
          className="btn-link"
          hidden={!selected}
          onClick={onClear}
        >
          Clear selection
        </button>
      </div>
      {selectable.length > 0 ? (
        <div className="bucket-chips" role="group" aria-labelledby="bucket-title">
          {selectable.map((key) => {
            const bucket = result.buckets[key];
            const tone = toneOfExact(bucket.exact);
            const exactTitle = isCentExact(bucket)
              ? undefined
              : `Exact ${exactText(bucket)}`;
            return (
              <button
                key={key}
                type="button"
                ref={(node) => {
                  if (chipRefs.current) chipRefs.current[key] = node;
                }}
                className={`chip tone-${tone}`}
                data-bucket={key}
                aria-pressed={selected === key}
                title={exactTitle}
                onClick={() => onSelect(key)}
              >
                <span className="chip-name">
                  <ChipIcon tone={tone} />
                  <span>{BUCKET_LABELS[key]}</span>
                </span>
                <span className="chip-amount">{bucket.display}</span>
                <span className="chip-count">
                  {plural(bucket.contributors, "Contributor")}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {note ? <p className="bucket-note">{note}</p> : null}
    </div>
  );
}
