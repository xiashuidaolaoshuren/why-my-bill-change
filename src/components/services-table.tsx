"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { isCentExact, toneOfExact } from "@/components/headline";
import type { BucketKey } from "@/core/compare";
import type { CompareResponse, MoneyJson, RowJson, RowSideJson } from "@/core/present";
import type { Tone } from "@/core/summary";
import {
  contributionOf,
  defaultSort,
  visibleRows,
  type SortKey,
  type SortState,
  type StatusFilter,
} from "@/lib/services-view";

const BUCKET_LABELS: Record<BucketKey, string> = {
  added: "Added",
  usage: "Usage",
  price: "Price",
  removed: "Removed",
};

const STATUS_LABEL: Record<RowJson["status"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

const STATUS_MARK: Record<RowJson["status"], string> = {
  added: "+",
  removed: "−",
  changed: "±",
  unchanged: "=",
};

const STATUS_SEGMENTS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "added", label: "Added" },
  { key: "removed", label: "Removed" },
  { key: "changed", label: "Changed" },
  { key: "unchanged", label: "Unchanged" },
];

const SORT_COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "service", label: "Service", className: "col-service" },
  { key: "status", label: "Status", className: "col-status" },
  { key: "before", label: "Before Cost", className: "num" },
  { key: "after", label: "After Cost", className: "num" },
  { key: "change", label: "Total change", className: "num col-change" },
];

const ICON_PATHS = {
  up: ["M8 13V3.5M4 7.5 8 3.5l4 4"],
  down: ["M8 3v9.5M4 8.5l4 4 4-4"],
  flat: ["M3.5 6.5h9M3.5 9.5h9"],
  chevron: ["M6 3.5 10.5 8 6 12.5"],
  sort: ["M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3"],
  sortAsc: ["M8 12.5V3.5M4.5 7 8 3.5 11.5 7"],
  sortDesc: ["M8 3.5v9M4.5 9 8 12.5 11.5 9"],
} as const;

function Icon({
  name,
  className = "",
}: {
  name: keyof typeof ICON_PATHS;
  className?: string;
}) {
  return (
    <svg
      className={`od-icon ${className}`.trim()}
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

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function exactText(value: MoneyJson): string {
  const ex = value.exact;
  return ex.startsWith("-") ? `-HK$${ex.slice(1)}` : `HK$${ex}`;
}

function rowDomId(service: string): string {
  return `svc-${service.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "row"}`;
}

type FormulaLine = {
  key: string;
  term: string;
  display: string;
  exact: string;
  values: MoneyJson[];
};

function formulaLines(row: RowJson): FormulaLine[] {
  const b = row.before;
  const a = row.after;
  const D = (value: MoneyJson) => value.display;
  const X = (value: MoneyJson) => exactText(value);
  const line = (
    key: string,
    term: string,
    display: string,
    exact: string,
    values: MoneyJson[],
  ): FormulaLine => ({ key, term, display, exact, values });

  switch (row.status) {
    case "added":
      if (!a) return [];
      return [
        line(
          "added",
          "Added",
          `${a.quantity.exact} × ${D(a.unitPrice)} = ${D(row.change)}`,
          `${a.quantity.exact} × ${X(a.unitPrice)} = ${X(row.change)}`,
          [a.unitPrice, row.change],
        ),
      ];
    case "removed":
      if (!b) return [];
      return [
        line(
          "removed",
          "Removed",
          `−(${b.quantity.exact} × ${D(b.unitPrice)}) = ${D(row.change)}`,
          `−(${b.quantity.exact} × ${X(b.unitPrice)}) = ${X(row.change)}`,
          [b.unitPrice, row.change],
        ),
      ];
    case "changed":
      if (!b || !a) return [];
      return [
        line(
          "usage",
          "Usage effect",
          `(${a.quantity.exact} − ${b.quantity.exact}) × ${D(b.unitPrice)} = ${D(row.usageEffect)}`,
          `(${a.quantity.exact} − ${b.quantity.exact}) × ${X(b.unitPrice)} = ${X(row.usageEffect)}`,
          [b.unitPrice, row.usageEffect],
        ),
        line(
          "price",
          "Price effect",
          `(${D(a.unitPrice)} − ${D(b.unitPrice)}) × ${a.quantity.exact} = ${D(row.priceEffect)}`,
          `(${X(a.unitPrice)} − ${X(b.unitPrice)}) × ${a.quantity.exact} = ${X(row.priceEffect)}`,
          [a.unitPrice, b.unitPrice, row.priceEffect],
        ),
        line(
          "total",
          "Total change",
          `${D(a.cost)} − ${D(b.cost)} = ${D(row.change)}`,
          `${X(a.cost)} − ${X(b.cost)} = ${X(row.change)}`,
          [a.cost, b.cost, row.change],
        ),
      ];
    default:
      if (!b || !a) return [];
      return [
        line(
          "total",
          "Total change",
          `${D(a.cost)} − ${D(b.cost)} = ${D(row.change)}`,
          `${X(a.cost)} − ${X(b.cost)} = ${X(row.change)}`,
          [a.cost, b.cost, row.change],
        ),
      ];
  }
}

function MoneyCell({
  value,
  showTone = true,
}: {
  value: MoneyJson;
  showTone?: boolean;
}) {
  const tone = toneOfExact(value.exact);
  const title = isCentExact(value) ? undefined : `Exact ${exactText(value)}`;
  return (
    <span
      className={`money${showTone ? ` tone-${tone}` : ""}`}
      title={title}
    >
      {showTone ? <Icon name={tone} /> : null}
      <span>{value.display}</span>
    </span>
  );
}

function CostCell({ side }: { side: RowSideJson | null }) {
  if (!side) {
    return (
      <>
        <span className="absent-mark" aria-hidden="true">
          —
        </span>
        <span className="sr-only">Not in this bill</span>
      </>
    );
  }
  const title = isCentExact(side.cost) ? undefined : `Exact ${exactText(side.cost)}`;
  return (
    <span className="money" title={title}>
      {side.cost.display}
    </span>
  );
}

function BillPanel({
  side,
  fileName,
  sourceLine,
  data,
}: {
  side: "before" | "after";
  fileName: string;
  sourceLine: number | null;
  data: RowSideJson | null;
}) {
  const label = side === "before" ? "Before bill" : "After bill";
  if (!data) {
    return (
      <section className="bill-panel">
        <h3 className="detail-label">{label}</h3>
        <p className="bill-source">{fileName}</p>
        <p className="bill-absent">Not in this bill</p>
      </section>
    );
  }
  const exactNote = (value: MoneyJson) =>
    isCentExact(value) ? null : (
      <span className="exact">exact {exactText(value)}</span>
    );

  return (
    <section className="bill-panel">
      <h3 className="detail-label">{label}</h3>
      <p className="bill-source">
        {fileName}
        {sourceLine !== null ? ` · Source line ${sourceLine}` : ""}
      </p>
      <dl className="facts">
        <div>
          <dt>Quantity</dt>
          <dd>
            <span>{data.quantity.exact}</span>
          </dd>
        </div>
        <div>
          <dt>Unit price</dt>
          <dd>
            <span>{data.unitPrice.display}</span>
            {exactNote(data.unitPrice)}
            <span className="per">per Quantity unit</span>
          </dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>
            <span>{data.cost.display}</span>
            {exactNote(data.cost)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RowDetail({
  row,
  fileNames,
  activeBucket,
}: {
  row: RowJson;
  fileNames: { before: string; after: string };
  activeBucket: BucketKey | null;
}) {
  const lines = formulaLines(row);
  const allCentExact = lines.every((l) => l.values.every((v) => isCentExact(v)));

  return (
    <div
      className="detail"
      role="region"
      aria-label={`${row.service}: Source lines and worked formula`}
    >
      <div className="detail-grid">
        <BillPanel
          side="before"
          fileName={fileNames.before}
          sourceLine={row.sources.before?.line ?? null}
          data={row.before}
        />
        <BillPanel
          side="after"
          fileName={fileNames.after}
          sourceLine={row.sources.after?.line ?? null}
          data={row.after}
        />
        <section className="formula-panel">
          <h3 className="detail-label">Worked formula</h3>
          <dl className="formulas">
            {lines.map((l) => {
              const needsExact = l.values.some((v) => !isCentExact(v));
              return (
                <div
                  key={l.key}
                  className={`formula${l.key === activeBucket ? " is-active" : ""}`}
                >
                  <dt>{l.term}</dt>
                  <dd>
                    <code>{l.display}</code>
                    {needsExact ? (
                      <span className="exact">
                        exact <code>{l.exact}</code>
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          {row.status === "unchanged" ? (
            <p className="formula-note">
              Same Quantity and unit price in both bills, so this Service is not a
              Contributor.
            </p>
          ) : null}
          {row.status === "changed" ? (
            <p className="formula-note">
              Usage effect + Price effect = Total change.
            </p>
          ) : null}
          {allCentExact ? (
            <p className="formula-note">Every value here is exact to the cent.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function ServicesTable({
  result,
  fileNames,
  bucket,
  onClearBucket,
  onClearAllFilters,
}: {
  result: CompareResponse;
  fileNames: { before: string; after: string };
  bucket: BucketKey | null;
  onClearBucket: () => void;
  onClearAllFilters: () => void;
}) {
  const statusLabelId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortState>(() => defaultSort(bucket));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setStatus("all");
    setSort(defaultSort(bucket));
    setExpanded(new Set());
  }, [bucket]);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;

    const sync = () => {
      wrap.style.setProperty("--wrap-w", `${Math.floor(wrap.clientWidth)}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const { rows, counts } = useMemo(
    () =>
      visibleRows({
        rows: result.rows,
        bucket,
        status,
        search,
        sort,
      }),
    [result.rows, bucket, status, search, sort],
  );

  const sortBy = useCallback(
    (key: SortKey) => {
      setSort((previous) => {
        if (previous.key === key) {
          return { ...previous, dir: previous.dir === "desc" ? "asc" : "desc" };
        }
        return {
          key,
          dir: key === "service" || key === "status" ? "asc" : "desc",
          magnitude: key === "change" && bucket !== null,
        };
      });
    },
    [bucket],
  );

  const toggleRow = useCallback((service: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(service)) next.delete(service);
      else next.add(service);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatus("all");
    setSort(defaultSort(null));
    onClearAllFilters();
    window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  }, [onClearAllFilters]);

  const emptyMessage = useMemo(() => {
    if (result.rows.length === 0) {
      return "Neither bill lists a Service, so there is nothing to compare row by row.";
    }
    const filters: string[] = [];
    if (search.trim()) filters.push(`the search “${search.trim()}”`);
    if (status !== "all") filters.push(`the status ${STATUS_LABEL[status]}`);
    if (bucket) filters.push(`the ${BUCKET_LABELS[bucket]} Bucket`);
    return `No Service matches ${joinList(filters)}. Clear the filters to see all ${plural(result.rows.length, "Service")}.`;
  }, [bucket, result.rows.length, search, status]);

  const changeHeader = bucket ? BUCKET_LABELS[bucket] : "Total change";
  const changeSub =
    bucket && sort.key === "change" && sort.magnitude
      ? "Bucket contribution · by size"
      : bucket
        ? "Bucket contribution"
        : null;

  const bucketEntry = bucket ? result.buckets[bucket] : null;

  return (
    <section className="services" aria-labelledby="services-title">
      <div className="section-head">
        <h2 className="section-title" id="services-title">
          Services
        </h2>
        <p className="section-help" id="services-meta">
          {rows.length} of {plural(result.rows.length, "Service")} shown
        </p>
      </div>

      <div className="services-toolbar">
        <div className="search-field">
          <label htmlFor="service-search" className="label">
            Search Services
          </label>
          <div className="search-box">
            <svg
              className="od-icon search-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="7" cy="7" r="4.25" />
              <path d="m10.25 10.25 3.25 3.25" />
            </svg>
            <input
              ref={searchRef}
              id="service-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Service name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="status-field">
          <p className="label" id={statusLabelId}>
            Status
          </p>
          <div className="segmented" role="group" aria-labelledby={statusLabelId}>
            {STATUS_SEGMENTS.map((segment) => (
              <button
                key={segment.key}
                type="button"
                aria-pressed={status === segment.key}
                onClick={() => setStatus(segment.key)}
              >
                <span className="seg-label">{segment.label}</span>
                <span className="seg-count">{counts[segment.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {bucket && bucketEntry ? (
        <div className="bucket-filter">
          <p className="bucket-filter-text">
            Showing the {plural(bucketEntry.contributors, "Contributor")} to the{" "}
            {BUCKET_LABELS[bucket]} Bucket ({bucketEntry.display}). The money column
            shows each Bucket contribution.
          </p>
          <button type="button" className="btn-link" onClick={onClearBucket}>
            Clear
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="ledger">
            <caption className="sr-only">
              Services in both bills. Each row expands to show its Source lines and
              worked formula.
            </caption>
            <thead>
              <tr>
                {SORT_COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  const sortIcon = active
                    ? sort.dir === "asc"
                      ? "sortAsc"
                      : "sortDesc"
                    : "sort";
                  const isChange = column.key === "change";
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={`${column.className ?? ""}${active ? " is-sorted" : ""}${isChange && bucket ? " is-bucket" : ""}`.trim()}
                      aria-sort={
                        active
                          ? sort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className="sort-btn"
                        onClick={() => sortBy(column.key)}
                      >
                        <span className="sort-text">
                          <span className="sort-name">
                            {isChange ? changeHeader : column.label}
                          </span>
                          {isChange && changeSub ? (
                            <span className="sort-sub">{changeSub}</span>
                          ) : null}
                        </span>
                        <span className="sort-icon" aria-hidden="true">
                          <Icon name={sortIcon} />
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const domId = rowDomId(row.service);
                const open = expanded.has(row.service);
                const moneyValue = bucket
                  ? contributionOf(row, bucket)
                  : row.change;
                return (
                  <Fragment key={row.service}>
                    <tr className={`svc-row${open ? " is-expanded" : ""}`}>
                      <th scope="row" className="col-service">
                        <button
                          type="button"
                          className="row-toggle"
                          aria-expanded={open}
                          aria-controls={`${domId}-detail`}
                          onClick={() => toggleRow(row.service)}
                        >
                          <Icon name="chevron" className="row-chevron" />
                          <span className="service-name">{row.service}</span>
                        </button>
                      </th>
                      <td className="col-status">
                        <span className={`status status-${row.status}`}>
                          <span className="status-mark" aria-hidden="true">
                            {STATUS_MARK[row.status]}
                          </span>
                          <span>{STATUS_LABEL[row.status]}</span>
                        </span>
                      </td>
                      <td className="num">
                        <CostCell side={row.before} />
                      </td>
                      <td className="num">
                        <CostCell side={row.after} />
                      </td>
                      <td className={`num col-change${bucket ? " is-bucket" : ""}`}>
                        <MoneyCell value={moneyValue} />
                      </td>
                    </tr>
                    <tr
                      className="detail-row"
                      id={`${domId}-detail`}
                      hidden={!open}
                    >
                      <td colSpan={5}>
                        <RowDetail
                          row={row}
                          fileNames={fileNames}
                          activeBucket={bucket}
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-title">No Services match</p>
          <p className="empty-body">{emptyMessage}</p>
          {result.rows.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
