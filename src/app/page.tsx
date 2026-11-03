"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { BucketSelector } from "@/components/bucket-selector";
import {
  Reconciliation,
  RoundingNotice,
  Stats,
  SummarySentence,
} from "@/components/headline";
import { UploadPanel, type BillFileSlots } from "@/components/upload";
import { Waterfall } from "@/components/waterfall";
import type { BucketKey } from "@/core/compare";
import type { CompareResponse } from "@/core/present";
import type { BillSide, ValidationError } from "@/core/validate";
import {
  loadHeadlineSample,
  loadInvalidSample,
  SAMPLE_LOAD_FAILURE,
} from "@/lib/load-sample";

/**
 * F1 renders the four views the prototype settles: upload, pending, result,
 * error. F2 wires upload, samples, and POST /api/compare into that shell.
 */
type View = "upload" | "loading" | "result" | "error";

const VIEW_ORDER: readonly View[] = ["upload", "loading", "result", "error"];

const MIN_PENDING_MS = 280;

const FAILURE_MESSAGE =
  "The comparison could not be completed. Nothing from it is shown.";

const SIDE_LABEL: Record<BillSide, string> = {
  before: "Before bill",
  after: "After bill",
};

const ANNOUNCEMENTS: Record<View, string> = {
  upload: "Upload state. Add both bills to compare them.",
  loading: "Comparing both bills.",
  result: "Comparison ready.",
  error: "Comparison not possible.",
};

const SKELETON_ROW_COUNT = 6;

const BUCKET_LABELS: Record<BucketKey, string> = {
  added: "Added",
  usage: "Usage",
  price: "Price",
  removed: "Removed",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function isView(value: string | null): value is View {
  return value !== null && (VIEW_ORDER as readonly string[]).includes(value);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function announceToRegion(setAnnouncement: (value: string) => void, message: string) {
  setAnnouncement("");
  window.requestAnimationFrame(() => setAnnouncement(message));
}

export default function Home() {
  const [view, setView] = useState<View>("upload");
  const [announcement, setAnnouncement] = useState("");
  const [files, setFiles] = useState<BillFileSlots>({ before: null, after: null });
  const [pendingFiles, setPendingFiles] = useState<BillFileSlots>({
    before: null,
    after: null,
  });
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [errors, setErrors] = useState<ValidationError[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bucket, setBucket] = useState<BucketKey | null>(null);

  const runRef = useRef(0);
  const chipRefs = useRef<Partial<Record<BucketKey, HTMLButtonElement | null>>>({});

  const headings = {
    upload: useRef<HTMLHeadingElement | null>(null),
    loading: useRef<HTMLHeadingElement | null>(null),
    result: useRef<HTMLHeadingElement | null>(null),
    error: useRef<HTMLHeadingElement | null>(null),
  } satisfies Record<View, RefObject<HTMLHeadingElement | null>>;

  const presentedView = useRef<View | null>(null);

  const announce = useCallback((message: string) => {
    announceToRegion(setAnnouncement, message);
  }, []);

  useEffect(() => {
    if (presentedView.current === view) return;
    const isFirstRun = presentedView.current === null;
    presentedView.current = view;
    if (isFirstRun) return;
    setAnnouncement(ANNOUNCEMENTS[view]);
    window.scrollTo({ top: 0 });
    headings[view].current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (files.before || files.after) return;
    const requested = new URLSearchParams(window.location.search).get("view");
    if (isView(requested)) setView(requested);
  }, [files.before, files.after]);

  const clearOutcome = useCallback(() => {
    setResult(null);
    setErrors(null);
    setFailure(null);
    setBucket(null);
  }, []);

  const selectBucket = useCallback(
    (key: BucketKey) => {
      setBucket((previous) => {
        const next = previous === key ? null : key;
        if (!result) return next;
        const entry = result.buckets[key];
        if (next) {
          announce(
            `${BUCKET_LABELS[key]} Bucket selected: ${entry.display} from ${plural(entry.contributors, "Contributor")}, largest Bucket contribution first.`,
          );
        } else {
          announce("Bucket selection cleared. The table lists every Service.");
        }
        return next;
      });
    },
    [announce, result],
  );

  const clearBucket = useCallback(() => {
    const previous = bucket;
    if (!previous) return;
    setBucket(null);
    announce("Bucket selection cleared. The table lists every Service.");
    window.requestAnimationFrame(() => {
      chipRefs.current[previous]?.focus({ preventScroll: true });
    });
  }, [announce, bucket]);

  const runComparison = useCallback(
    async (nextFiles: { before: File; after: File }) => {
      const run = ++runRef.current;
      clearOutcome();
      setPendingFiles({ before: nextFiles.before, after: nextFiles.after });
      setView("loading");
      setBusy(true);

      const started = performance.now();
      let response: Response;
      try {
        const body = new FormData();
        body.set("before", nextFiles.before);
        body.set("after", nextFiles.after);
        response = await fetch("/api/compare", { method: "POST", body });
      } catch {
        const remaining = MIN_PENDING_MS - (performance.now() - started);
        if (remaining > 0) await wait(remaining);
        if (run !== runRef.current) {
          setBusy(false);
          return;
        }
        setFailure(FAILURE_MESSAGE);
        setView("error");
        setBusy(false);
        return;
      }

      const remaining = MIN_PENDING_MS - (performance.now() - started);
      if (remaining > 0) await wait(remaining);
      if (run !== runRef.current) {
        setBusy(false);
        return;
      }

      if (response.status === 200) {
        const data = (await response.json()) as CompareResponse;
        setResult(data);
        setView("result");
        setBusy(false);
        return;
      }

      if (response.status === 400) {
        try {
          const data = (await response.json()) as { errors?: ValidationError[] };
          if (data.errors && data.errors.length > 0) {
            setErrors(data.errors);
            setView("error");
            setBusy(false);
            return;
          }
        } catch {
          /* fall through to generic failure */
        }
      }

      setFailure(FAILURE_MESSAGE);
      setView("error");
      setBusy(false);
    },
    [clearOutcome],
  );

  const onFile = useCallback((side: BillSide, file: File) => {
    setFiles((prev) => ({ ...prev, [side]: file }));
  }, []);

  const onRemove = useCallback((side: BillSide) => {
    setFiles((prev) => ({ ...prev, [side]: null }));
  }, []);

  const onCompare = useCallback(() => {
    const { before, after } = files;
    if (!before || !after) return;
    void runComparison({ before, after });
  }, [files, runComparison]);

  const loadAndCompare = useCallback(
    async (loader: () => Promise<{ before: File; after: File }>) => {
      const gate = ++runRef.current;
      clearOutcome();
      setBusy(true);
      try {
        const loaded = await loader();
        if (gate !== runRef.current) {
          setBusy(false);
          return;
        }
        setFiles(loaded);
        await runComparison(loaded);
      } catch {
        if (gate !== runRef.current) {
          setBusy(false);
          return;
        }
        setFailure(SAMPLE_LOAD_FAILURE);
        setView("error");
        setBusy(false);
      }
    },
    [clearOutcome, runComparison],
  );

  const onUseSample = useCallback(() => {
    void loadAndCompare(loadHeadlineSample);
  }, [loadAndCompare]);

  const onUseInvalidSample = useCallback(() => {
    void loadAndCompare(loadInvalidSample);
  }, [loadAndCompare]);

  const startOver = useCallback(() => {
    runRef.current += 1;
    clearOutcome();
    setFiles({ before: null, after: null });
    setPendingFiles({ before: null, after: null });
    setBusy(false);
    setView("upload");
    announce("Comparison cleared. Add two bills to start again.");
    window.requestAnimationFrame(() => {
      document.getElementById("use-sample")?.focus({ preventScroll: true });
    });
  }, [announce, clearOutcome]);

  const backToUpload = useCallback(() => {
    runRef.current += 1;
    clearOutcome();
    setBusy(false);
    setView("upload");
    window.requestAnimationFrame(() => {
      headings.upload.current?.focus({ preventScroll: true });
    });
  }, [clearOutcome, headings.upload]);

  const loadingBefore = pendingFiles.before?.name ?? "…";
  const loadingAfter = pendingFiles.after?.name ?? "…";

  const resultBefore = files.before?.name;
  const resultAfter = files.after?.name;

  // `pendingFiles` is set before every request and only read while a result is
  // on screen, so it names the pair the result was computed from.
  const comparedNames = {
    before: pendingFiles.before?.name ?? resultBefore ?? "",
    after: pendingFiles.after?.name ?? resultAfter ?? "",
  };

  const errorCount = errors?.length ?? 0;
  const errorTitle =
    failure && errorCount === 0
      ? "The comparison could not be completed"
      : errorCount === 1
        ? "1 issue blocked the comparison"
        : `${errorCount} issues blocked the comparison`;

  return (
    <>
      <main id="main" className="wrap" tabIndex={-1} data-view={view}>
        <section
          id="view-upload"
          className="view view-upload"
          aria-labelledby="upload-title"
          hidden={view !== "upload"}
        >
          <div className="upload-intro">
            <p className="eyebrow">New Comparison</p>
            <h1
              id="upload-title"
              ref={headings.upload}
              className="upload-title"
              tabIndex={-1}
            >
              Compare two monthly bills
            </h1>
            <p className="lede">
              Add the earlier and the later CSV export. Every dollar of the Total
              change is traced to a Service and sorted into four Buckets: added,
              usage, price and removed. The Reconciliation is exact to the last
              digit.
            </p>
          </div>

          <UploadPanel
            files={files}
            onFile={onFile}
            onRemove={onRemove}
            onCompare={onCompare}
            onUseSample={onUseSample}
            onUseInvalidSample={onUseInvalidSample}
            busy={busy}
            announce={announce}
          />
        </section>

        <section
          id="view-loading"
          className="view view-loading"
          aria-labelledby="loading-title"
          aria-busy="true"
          hidden={view !== "loading"}
        >
          <header className="result-head">
            <p className="eyebrow">Comparison pending</p>
            <h1
              id="loading-title"
              ref={headings.loading}
              className="loading-title"
              tabIndex={-1}
            >
              Comparing{" "}
              <span className="file-ref" id="loading-before">
                {loadingBefore}
              </span>{" "}
              with{" "}
              <span className="file-ref" id="loading-after">
                {loadingAfter}
              </span>
            </h1>
            <p className="lede" role="status">
              Reading both files, matching Services and checking the
              Reconciliation.
            </p>
          </header>
          <div className="stats skeleton-stats" aria-hidden="true">
            <div className="stat">
              <span className="skel skel-label" />
              <span className="skel skel-figure" />
            </div>
            <div className="stat">
              <span className="skel skel-label" />
              <span className="skel skel-figure" />
            </div>
            <div className="stat">
              <span className="skel skel-label" />
              <span className="skel skel-figure" />
            </div>
          </div>
          <div className="services" aria-hidden="true">
            <div className="table-wrap">
              <table className="ledger skeleton-ledger">
                <thead>
                  <tr>
                    <th className="col-service">
                      <span className="th-static">Service</span>
                    </th>
                    <th className="col-status">
                      <span className="th-static">Status</span>
                    </th>
                    <th className="num">
                      <span className="th-static">Before Cost</span>
                    </th>
                    <th className="num">
                      <span className="th-static">After Cost</span>
                    </th>
                    <th className="num">
                      <span className="th-static">Total change</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                    <tr key={index}>
                      <th className="col-service">
                        <span className="skel skel-text" />
                      </th>
                      <td>
                        <span className="skel skel-badge" />
                      </td>
                      <td>
                        <span className="skel skel-money" />
                      </td>
                      <td>
                        <span className="skel skel-money" />
                      </td>
                      <td>
                        <span className="skel skel-money" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section
          id="view-result"
          className="view view-result"
          aria-labelledby="summary-heading"
          hidden={view !== "result"}
        >
          <header className="result-head">
            <div className="result-bar">
              <p className="eyebrow">
                Comparison
                {resultBefore && resultAfter ? (
                  <>
                    {" · "}
                    <span className="file-ref">{resultBefore}</span>
                    {" → "}
                    <span className="file-ref">{resultAfter}</span>
                  </>
                ) : null}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={startOver}
              >
                Start over
              </button>
            </div>
            <h1
              id="summary-heading"
              ref={headings.result}
              className="summary"
              tabIndex={-1}
            >
              {result ? (
                <SummarySentence parts={result.summaryParts} />
              ) : (
                "The summary sentence appears here."
              )}
            </h1>
            {result ? <RoundingNotice result={result} /> : null}
          </header>

          {result ? (
            <>
              <Stats result={result} fileNames={comparedNames} />
              <section className="movement" aria-labelledby="movement-title">
                <div className="section-head">
                  <h2 id="movement-title" className="section-title">
                    From before total to after total
                  </h2>
                  <p className="section-help">
                    Select a bar or a Bucket to list its Contributors.
                  </p>
                </div>
                <Waterfall
                  result={result}
                  fileNames={comparedNames}
                  selected={bucket}
                  onSelect={selectBucket}
                />
                <BucketSelector
                  result={result}
                  selected={bucket}
                  onSelect={selectBucket}
                  onClear={clearBucket}
                  chipRefs={chipRefs}
                />
                <Reconciliation result={result} />
              </section>
            </>
          ) : null}
        </section>

        <section
          id="view-error"
          className="view view-error"
          aria-labelledby="error-title"
          hidden={view !== "error"}
        >
          <header className="result-head">
            <p className="eyebrow">Comparison not possible</p>
            <h1
              id="error-title"
              ref={headings.error}
              className="error-title"
              tabIndex={-1}
            >
              {errorTitle}
            </h1>
            <p className="lede">
              {failure && errorCount === 0
                ? failure
                : "Fix the rows listed below, then compare the bills again."}
            </p>
          </header>

          {failure && errorCount > 0 ? (
            <p className="failure-message">{failure}</p>
          ) : null}

          {errors && errors.length > 0 ? (
            <ul className="validation-errors">
              {errors.map((entry, index) => (
                <li key={`${entry.file}-${entry.line}-${entry.column}-${index}`}>
                  <strong>{SIDE_LABEL[entry.file]}</strong>
                  {entry.line !== null ? ` · line ${entry.line}` : ""}
                  {entry.column ? ` · ${entry.column}` : ""}
                  {" — "}
                  {entry.message}
                </li>
              ))}
            </ul>
          ) : null}

          {failure && errorCount === 0 ? null : (
            <div className="action-row error-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={backToUpload}
              >
                Back to upload
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={startOver}
              >
                Start over
              </button>
            </div>
          )}

          {failure && errorCount === 0 ? (
            <div className="action-row error-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={startOver}
              >
                Start over
              </button>
            </div>
          ) : null}
        </section>
      </main>

      <p id="announcer" className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}
