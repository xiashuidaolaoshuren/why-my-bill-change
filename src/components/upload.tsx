"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { BillSide } from "@/core/validate";

export type BillFileSlots = { before: File | null; after: File | null };

const SIDES: BillSide[] = ["before", "after"];

const SIDE_LABEL: Record<BillSide, string> = {
  before: "Before bill",
  after: "After bill",
};

const SIDE_SUB: Record<BillSide, string> = {
  before: "The earlier month",
  after: "The later month",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileMeta(file: File): string {
  const kind = /\.csv$/i.test(file.name) ? "CSV" : file.type || "Unknown type";
  return `${formatBytes(file.size)} · ${kind}`;
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

type UploadProps = {
  files: BillFileSlots;
  onFile: (side: BillSide, file: File) => void;
  onRemove: (side: BillSide) => void;
  onCompare: () => void;
  onUseSample: () => void;
  onUseInvalidSample: () => void;
  busy: boolean;
  announce: (message: string) => void;
};

function UploadIcon() {
  return (
    <svg
      className="od-icon dz-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 10.5V2.5M4.75 5.75 8 2.5l3.25 3.25M2.5 10v3.5h11V10" />
    </svg>
  );
}

function DropZone({
  side,
  file,
  onFile,
  onRemove,
}: {
  side: BillSide;
  file: File | null;
  onFile: (side: BillSide, file: File) => void;
  onRemove: (side: BillSide) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);

  const choose = () => inputRef.current?.click();

  const onInputChange = () => {
    const picked = inputRef.current?.files?.[0];
    if (picked) onFile(side, picked);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDragLeave = (event: DragEvent) => {
    const zone = event.currentTarget;
    if (event.relatedTarget instanceof Node && zone.contains(event.relatedTarget)) {
      return;
    }
    setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(side, dropped);
  };

  const remove = () => {
    onRemove(side);
    chooseRef.current?.focus();
  };

  return (
    <div
      className="dropzone"
      id={`drop-${side}`}
      data-side={side}
      data-filled={String(Boolean(file))}
      data-dragging={dragging ? "true" : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="dz-head">
        <h2 className="dz-title">{SIDE_LABEL[side]}</h2>
        <p className="dz-sub">{SIDE_SUB[side]}</p>
      </div>

      {!file ? (
        <div className="dz-empty">
          <UploadIcon />
          <p className="dz-hint">Drag a CSV file here</p>
          <button
            ref={chooseRef}
            type="button"
            className="btn btn-secondary btn-small"
            onClick={choose}
            aria-label={`Choose a CSV file for the ${SIDE_LABEL[side]}`}
          >
            Choose file
          </button>
        </div>
      ) : (
        <div className="dz-file">
          <p className="dz-name">{file.name}</p>
          <p className="dz-meta">{fileMeta(file)}</p>
          <div className="dz-file-actions">
            <button
              type="button"
              className="btn-link"
              onClick={choose}
              aria-label={`Replace the ${SIDE_LABEL[side]} file`}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={remove}
              aria-label={`Remove ${file.name} from the ${SIDE_LABEL[side]}`}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        id={`file-${side}`}
        accept=".csv,text/csv"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onInputChange}
      />
    </div>
  );
}

export function UploadPanel({
  files,
  onFile,
  onRemove,
  onCompare,
  onUseSample,
  onUseInvalidSample,
  busy,
  announce,
}: UploadProps) {
  const { before, after } = files;
  const ready = Boolean(before && after);

  let hint = "Add both bills to compare them.";
  if (ready && before && after) {
    hint = `Ready to compare ${before.name} with ${after.name}.`;
  } else if (before) {
    hint = "Add the After bill to compare.";
  } else if (after) {
    hint = "Add the Before bill to compare.";
  }

  useEffect(() => {
    const onWindowDragOver = (event: Event) => {
      const drag = event as unknown as globalThis.DragEvent;
      drag.preventDefault();
      const inZone =
        drag.target instanceof Element && drag.target.closest(".dropzone");
      if (!inZone && drag.dataTransfer) drag.dataTransfer.dropEffect = "none";
    };
    const onWindowDrop = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, []);

  const handleFile = (side: BillSide, file: File) => {
    onFile(side, file);
    announce(`${file.name} added as the ${SIDE_LABEL[side]}.`);
  };

  const handleRemove = (side: BillSide) => {
    const removed = files[side];
    onRemove(side);
    if (removed) announce(`${removed.name} removed from the ${SIDE_LABEL[side]}.`);
  };

  return (
    <>
      <div className="upload-main">
        <div className="dropzones">
          {SIDES.map((side) => (
            <DropZone
              key={side}
              side={side}
              file={files[side]}
              onFile={handleFile}
              onRemove={handleRemove}
            />
          ))}
        </div>

        <div className="upload-actions">
          <div className="action-row">
            <button
              type="button"
              className={`btn ${ready ? "btn-secondary" : "btn-primary"}`}
              id="use-sample"
              onClick={onUseSample}
              disabled={busy}
            >
              Use sample files
            </button>
            <button
              type="button"
              className={`btn ${ready ? "btn-primary" : "btn-secondary"}`}
              id="compare-button"
              disabled={!ready || busy}
              aria-describedby="compare-hint"
              onClick={onCompare}
            >
              Compare bills
            </button>
          </div>
          <p className="hint" id="compare-hint">
            {hint}
          </p>
          <div className="demo-links">
            <p className="label" id="demo-label">
              Other samples
            </p>
            <ul className="demo-list" aria-labelledby="demo-label">
              <li>
                <button
                  type="button"
                  className="demo-link"
                  onClick={onUseInvalidSample}
                  disabled={busy}
                >
                  <span className="demo-name">Invalid</span>
                  <span className="demo-blurb">Errors by Source line</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <aside className="format-note" aria-labelledby="format-title">
        <h2 className="label" id="format-title">
          CSV format
        </h2>
        <pre className="format-sample">
          <code>{`service,quantity,unit_price
Compute,160,1
Storage,50,1.40`}</code>
        </pre>
        <ul className="format-rules">
          <li>
            All amounts are Hong Kong dollars (HK$). <code>unit_price</code> is the
            price of one Quantity unit.
          </li>
          <li>
            Header names are trimmed and case-insensitive; extra columns are ignored.
          </li>
          <li>
            Each Service appears once per file and matches across bills by its exact
            name.
          </li>
          <li>Plain decimals only, up to 12 digits on each side of the point.</li>
        </ul>
      </aside>
    </>
  );
}
