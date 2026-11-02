"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * F1 renders the four views the prototype settles: upload, pending, result,
 * error. They are wired (hidden/shown, focus, live region) but carry no data
 * UI yet. F2 replaces the dev-only view switch with the real transitions.
 */
type View = "upload" | "loading" | "result" | "error";

const VIEW_ORDER: readonly View[] = ["upload", "loading", "result", "error"];

const ANNOUNCEMENTS: Record<View, string> = {
  upload: "Upload state. Add both bills to compare them.",
  loading: "Comparing both bills.",
  result: "Comparison ready.",
  error: "Comparison not possible.",
};

function isView(value: string | null): value is View {
  return value !== null && (VIEW_ORDER as readonly string[]).includes(value);
}

export default function Home() {
  const [view, setView] = useState<View>("upload");
  const [announcement, setAnnouncement] = useState("");

  const headings = {
    upload: useRef<HTMLHeadingElement | null>(null),
    loading: useRef<HTMLHeadingElement | null>(null),
    result: useRef<HTMLHeadingElement | null>(null),
    error: useRef<HTMLHeadingElement | null>(null),
  } satisfies Record<View, RefObject<HTMLHeadingElement | null>>;

  // Track the view we have already presented. A first run (including the
  // double-invoked effects of React strict mode) must not steal focus on load.
  const presentedView = useRef<View | null>(null);

  useEffect(() => {
    if (presentedView.current === view) return;
    const isFirstRun = presentedView.current === null;
    presentedView.current = view;
    if (isFirstRun) return;
    setAnnouncement(ANNOUNCEMENTS[view]);
    window.scrollTo({ top: 0 });
    headings[view].current?.focus({ preventScroll: true });
    // The heading refs are stable; only the view decides where focus goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Dev-only: ?view=error shows a state that F2 cannot reach yet.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const requested = new URLSearchParams(window.location.search).get("view");
    if (isView(requested)) setView(requested);
  }, []);

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
              Comparing both bills
            </h1>
            <p className="lede" role="status">
              Reading both files, matching Services and checking the
              Reconciliation.
            </p>
          </header>
        </section>

        <section
          id="view-result"
          className="view view-result"
          aria-labelledby="summary-heading"
          hidden={view !== "result"}
        >
          <header className="result-head">
            <div className="result-bar">
              <p className="eyebrow">Comparison</p>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setView("upload")}
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
              The summary sentence appears here.
            </h1>
          </header>
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
              One of the bills could not be read
            </h1>
            <p className="lede">
              Fix the rows listed below, then compare the bills again.
            </p>
          </header>
          <div className="action-row error-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setView("upload")}
            >
              Back to upload
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setView("upload")}
            >
              Start over
            </button>
          </div>
        </section>
      </main>

      <p id="announcer" className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}
