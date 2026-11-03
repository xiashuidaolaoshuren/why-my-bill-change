"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { isCentExact, toneOfExact } from "@/components/headline";
import { BUCKET_KEYS, type BucketKey } from "@/core/compare";
import type { CompareResponse, MoneyJson } from "@/core/present";
import type { Tone } from "@/core/summary";

const CHART = {
  columnMinWidth: 600,
  figureCharWidth: 7.9,
  padX: 8,
  top: 40,
  plotHeight: 240,
  bottom: 60,
  rowHeight: 56,
  rowBar: 18,
  rowPad: 8,
  stagger: 45,
} as const;

const BUCKET_LABELS: Record<BucketKey, string> = {
  added: "Added",
  usage: "Usage",
  price: "Price",
  removed: "Removed",
};

export type ChartStepKey = BucketKey | "before" | "after";

type StepKind = "total" | "bucket";
type StepTone = Tone | "total";

export type ChartStep = {
  key: ChartStepKey;
  kind: StepKind;
  label: string;
  meta: string;
  startNum: number;
  endNum: number;
  value: MoneyJson;
  tone: StepTone;
  selectable?: boolean;
  count?: number;
};

type Anchor = { x: number; top: number; bottom: number };

type ChartMode = "columns" | "rows";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Float coordinates for chart geometry only; never shown as money. */
function plotNum(exact: string): number {
  return Number(exact);
}

export function buildSteps(result: CompareResponse): ChartStep[] {
  const beforeNum = plotNum(result.totals.before.exact);
  const beforeCount = result.rows.filter((row) => row.before !== null).length;
  const afterCount = result.rows.filter((row) => row.after !== null).length;

  const steps: ChartStep[] = [
    {
      key: "before",
      kind: "total",
      label: "Before total",
      meta: plural(beforeCount, "Service"),
      startNum: 0,
      endNum: beforeNum,
      value: result.totals.before,
      tone: "total",
    },
  ];

  let level = beforeNum;
  for (const key of BUCKET_KEYS) {
    const bucket = result.buckets[key];
    const startNum = level;
    level += plotNum(bucket.exact);
    const count = bucket.contributors;
    steps.push({
      key,
      kind: "bucket",
      label: BUCKET_LABELS[key],
      meta: count ? plural(count, "Contributor") : "No Contributors",
      startNum,
      endNum: level,
      value: { exact: bucket.exact, display: bucket.display },
      tone: toneOfExact(bucket.exact),
      selectable: count > 0,
      count,
    });
  }

  steps.push({
    key: "after",
    kind: "total",
    label: "After total",
    meta: plural(afterCount, "Service"),
    startNum: 0,
    endNum: plotNum(result.totals.after.exact),
    value: result.totals.after,
    tone: "total",
  });

  return steps;
}

function chartDomain(steps: ChartStep[]): { lo: number; hi: number } {
  const values = steps.flatMap((step) => [step.startNum, step.endNum]);
  const lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (hi === lo) hi = lo + 1;
  return { lo, hi };
}

export function chartDescription(steps: ChartStep[]): string {
  const parts = steps.map((step) =>
    step.kind === "total"
      ? `${step.label} ${step.value.display}`
      : `${step.label} ${step.value.display} from ${step.count ? plural(step.count, "Contributor") : "no Contributors"}`,
  );
  return `Waterfall chart. ${parts.join("; ")}.`;
}

function pickMode(width: number, steps: ChartStep[]): ChartMode {
  const widestLabel =
    Math.max(...steps.map((step) => step.value.display.length)) * CHART.figureCharWidth;
  const band = (width - CHART.padX * 2) / steps.length;
  return width >= CHART.columnMinWidth && band >= widestLabel + 16 ? "columns" : "rows";
}

type ColumnLayout = {
  mode: "columns";
  height: number;
  width: number;
  hitStyle: CSSProperties;
  anchors: Record<string, Anchor>;
  zeroY: number;
  bars: Array<{
    step: ChartStep;
    index: number;
    cx: number;
    x: number;
    barY: number;
    barH: number;
    barWidth: number;
    growsDown: boolean;
    labelY: number;
    rail: { x1: number; y1: number; x2: number; y2: number } | null;
  }>;
};

type RowLayout = {
  mode: "rows";
  height: number;
  width: number;
  hitStyle: CSSProperties;
  anchors: Record<string, Anchor>;
  zeroX: number;
  bars: Array<{
    step: ChartStep;
    index: number;
    cy: number;
    barX: number;
    barY: number;
    barW: number;
    barH: number;
    growsLeft: boolean;
    rail: { x1: number; y1: number; x2: number; y2: number } | null;
  }>;
};

function layoutColumns(steps: ChartStep[], width: number): ColumnLayout {
  const { padX, top, plotHeight, bottom, stagger: _stagger } = CHART;
  const height = top + plotHeight + bottom;
  const { lo, hi } = chartDomain(steps);
  const band = (width - padX * 2) / steps.length;
  const barWidth = round1(Math.min(band * 0.56, 96));
  const y = (v: number) => round1(top + ((hi - v) / (hi - lo)) * plotHeight);
  const anchors: Record<string, Anchor> = {};
  const zeroY = y(0);
  const labelY = height - bottom + 24;

  const bars = steps.map((step, index) => {
    const cx = round1(padX + band * (index + 0.5));
    const x = round1(cx - barWidth / 2);
    const a = step.startNum;
    const b = step.endNum;
    const yTop = y(Math.max(a, b));
    const yBottom = y(Math.min(a, b));
    const flat = yBottom - yTop < 2;
    const barY = flat ? round1(y(b) - 1) : yTop;
    const barH = flat ? 2 : round1(yBottom - yTop);
    const growsDown = step.kind === "bucket" && step.endNum < step.startNum;
    anchors[step.key] = { x: cx, top: barY, bottom: barY + barH };

    const rail =
      index < steps.length - 1
        ? {
            x1: round1(x + barWidth),
            y1: y(b),
            x2: round1(x + band),
            y2: y(b),
          }
        : null;

    return { step, index, cx, x, barY, barH, barWidth, growsDown, labelY, rail };
  });

  const hitStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
    paddingInline: padX,
    height,
  };

  return { mode: "columns", height, width, hitStyle, anchors, zeroY, bars };
}

function layoutRows(steps: ChartStep[], width: number): RowLayout {
  const { rowHeight, rowBar, rowPad, figureCharWidth } = CHART;
  const labelWidth = Math.min(Math.max(width * 0.3, 112), 156);
  const valueWidth =
    Math.max(...steps.map((step) => step.value.display.length)) * figureCharWidth + 12;
  const x0 = labelWidth + 8;
  const x1 = Math.max(x0 + 48, width - valueWidth - 8);
  const height = rowPad * 2 + rowHeight * steps.length;
  const { lo, hi } = chartDomain(steps);
  const x = (v: number) => round1(x0 + ((v - lo) / (hi - lo)) * (x1 - x0));
  const anchors: Record<string, Anchor> = {};
  const zeroX = x(0);

  const bars = steps.map((step, index) => {
    const cy = rowPad + rowHeight * (index + 0.5);
    const a = step.startNum;
    const b = step.endNum;
    const left = x(Math.min(a, b));
    const right = x(Math.max(a, b));
    const flat = right - left < 2;
    const barX = flat ? round1(x(b) - 1) : left;
    const barW = flat ? 2 : round1(right - left);
    const barY = round1(cy - rowBar / 2);
    const growsLeft = step.kind === "bucket" && step.endNum < step.startNum;
    anchors[step.key] = { x: round1(barX + barW / 2), top: barY, bottom: barY + rowBar };

    const rail =
      index < steps.length - 1
        ? {
            x1: x(b),
            y1: barY + rowBar,
            x2: x(b),
            y2: round1(cy + rowHeight - rowBar / 2),
          }
        : null;

    return { step, index, cy, barX, barY, barW, barH: rowBar, growsLeft, rail };
  });

  const hitStyle: CSSProperties = {
    gridTemplateRows: `repeat(${steps.length}, ${rowHeight}px)`,
    paddingBlock: rowPad,
    height,
  };

  return { mode: "rows", height, width, hitStyle, anchors, zeroX, bars };
}

function stepClass(
  step: ChartStep,
  selected: BucketKey | null,
  hoverKey: ChartStepKey | null,
): string {
  const parts = [
    "wf-step",
    `tone-${step.tone}`,
    step.kind === "bucket" ? "is-bucket" : "is-total",
  ];
  if (hoverKey === step.key) parts.push("is-hover");
  if (selected && step.kind === "bucket" && step.key === selected) parts.push("is-selected");
  return parts.join(" ");
}

function TooltipBody({
  step,
  fileNames,
}: {
  step: ChartStep;
  fileNames: { before: string; after: string };
}) {
  const rows: Array<{ key: string; value: string }> = [
    { key: "Displayed", value: step.value.display },
    { key: "Exact", value: step.value.exact },
  ];

  let foot: string;
  if (step.kind === "bucket") {
    foot = step.selectable
      ? `${plural(step.count ?? 0, "Contributor")} · select to filter the table`
      : "No Contributors in this Bucket";
  } else if (step.key === "before") {
    foot = `${step.meta} in ${fileNames.before}`;
  } else {
    foot = `${step.meta} in ${fileNames.after}`;
  }

  const title = step.kind === "bucket" ? `${step.label} Bucket` : step.label;
  const showExactRow = !isCentExact(step.value);

  return (
    <>
      <span className="tt-title">{title}</span>
      {rows.map((row) =>
        row.key === "Exact" && !showExactRow ? null : (
          <div key={row.key} className="tt-row">
            <span className="tt-key">{row.key}</span>
            <span className="tt-val">{row.value}</span>
          </div>
        ),
      )}
      <span className="tt-foot">{foot}</span>
    </>
  );
}

export function Waterfall({
  result,
  fileNames,
  selected,
  onSelect,
}: {
  result: CompareResponse;
  fileNames: { before: string; after: string };
  selected: BucketKey | null;
  onSelect: (key: BucketKey) => void;
}) {
  const captionId = useId();
  const descId = useId();
  const tooltipId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverKey, setHoverKey] = useState<ChartStepKey | null>(null);
  const [entering, setEntering] = useState(true);
  const focusedStepRef = useRef<ChartStepKey | null>(null);

  const steps = useMemo(() => buildSteps(result), [result]);
  const description = useMemo(() => chartDescription(steps), [steps]);
  const mode = width > 0 ? pickMode(width, steps) : "columns";
  const layout = useMemo(() => {
    if (width <= 0) return null;
    return mode === "columns" ? layoutColumns(steps, width) : layoutRows(steps, width);
  }, [mode, steps, width]);

  useEffect(() => {
    setEntering(true);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntering(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result.summary]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;

    const measure = () => {
      const next = Math.floor(node.clientWidth);
      if (next > 0) setWidth(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusedStepRef.current || !canvasRef.current) return;
    const again = canvasRef.current.querySelector<HTMLButtonElement>(
      `button.wf-hit[data-step="${focusedStepRef.current}"]`,
    );
    again?.focus({ preventScroll: true });
  }, [layout, selected]);

  const positionTooltip = useCallback((stepKey: ChartStepKey) => {
    const canvas = canvasRef.current;
    const tip = tooltipRef.current;
    if (!canvas || !tip || !layout) return;
    const anchor = layout.anchors[stepKey];
    if (!anchor) return;

    tip.hidden = false;
    const canvasWidth = canvas.clientWidth;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const left = Math.max(0, Math.min(anchor.x - tipWidth / 2, canvasWidth - tipWidth));
    let top = anchor.top - tipHeight - 12;
    if (top < 0) top = anchor.bottom + 12;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, [layout]);

  const showTooltip = useCallback(
    (stepKey: ChartStepKey) => {
      setHoverKey(stepKey);
      window.requestAnimationFrame(() => positionTooltip(stepKey));
    },
    [positionTooltip],
  );

  const hideTooltip = useCallback(() => {
    setHoverKey(null);
    if (tooltipRef.current) tooltipRef.current.hidden = true;
  }, []);

  const onCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") hideTooltip();
    },
    [hideTooltip],
  );

  const hoverStep = hoverKey ? steps.find((step) => step.key === hoverKey) : null;

  return (
    <figure className="waterfall">
      <figcaption id={captionId} className="sr-only">
        Waterfall chart: before total, the four Buckets, then after total.
      </figcaption>
      <div
        ref={canvasRef}
        className={`wf-canvas${selected ? " has-selection" : ""}`}
        data-mode={layout?.mode ?? "columns"}
        onPointerLeave={hideTooltip}
        onKeyDown={onCanvasKeyDown}
      >
        {layout ? (
          <>
            <svg
              className={`wf-svg${entering ? " wf-entering" : ""}`}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width}
              height={layout.height}
              role="img"
              aria-labelledby={captionId}
              aria-describedby={descId}
            >
              {layout.mode === "columns" ? (
                <>
                  <line
                    className="wf-baseline"
                    x1={0}
                    x2={layout.width}
                    y1={layout.zeroY}
                    y2={layout.zeroY}
                  />
                  {layout.bars.map((bar) => {
                    const origin = bar.growsDown ? "center top" : "center bottom";
                    const delay = bar.index * CHART.stagger;
                    return (
                      <g
                        key={bar.step.key}
                        className={stepClass(bar.step, selected, hoverKey)}
                        data-bar={bar.step.key}
                      >
                        {bar.rail ? (
                          <line
                            className="wf-rail"
                            x1={bar.rail.x1}
                            x2={bar.rail.x2}
                            y1={bar.rail.y1}
                            y2={bar.rail.y2}
                          />
                        ) : null}
                        {bar.step.kind === "bucket" ? (
                          <rect
                            className="wf-ring"
                            x={bar.x - 4}
                            y={round1(bar.barY - 4)}
                            width={bar.barWidth + 8}
                            height={round1(bar.barH + 8)}
                            rx={2}
                          />
                        ) : null}
                        <rect
                          className="wf-bar"
                          x={bar.x}
                          y={bar.barY}
                          width={bar.barWidth}
                          height={bar.barH}
                          style={{
                            transformOrigin: origin,
                            animationDelay: `${delay}ms`,
                          }}
                        />
                        <text
                          className="wf-value"
                          x={bar.cx}
                          y={round1(bar.barY - 10)}
                          textAnchor="middle"
                          style={{ animationDelay: `${delay + 120}ms` }}
                        >
                          {bar.step.value.display}
                        </text>
                        <text
                          className="wf-name"
                          x={bar.cx}
                          y={bar.labelY}
                          textAnchor="middle"
                        >
                          {bar.step.label}
                        </text>
                        <text
                          className="wf-meta"
                          x={bar.cx}
                          y={bar.labelY + 18}
                          textAnchor="middle"
                        >
                          {bar.step.meta}
                        </text>
                        <rect
                          className="wf-mark"
                          x={bar.cx - 14}
                          y={bar.labelY + 28}
                          width={28}
                          height={3}
                        />
                      </g>
                    );
                  })}
                </>
              ) : (
                <>
                  <line
                    className="wf-baseline"
                    x1={layout.zeroX}
                    x2={layout.zeroX}
                    y1={CHART.rowPad}
                    y2={layout.height - CHART.rowPad}
                  />
                  {layout.bars.map((bar) => {
                    const origin = bar.growsLeft ? "right center" : "left center";
                    const delay = bar.index * CHART.stagger;
                    return (
                      <g
                        key={bar.step.key}
                        className={stepClass(bar.step, selected, hoverKey)}
                        data-bar={bar.step.key}
                      >
                        {bar.rail ? (
                          <line
                            className="wf-rail"
                            x1={bar.rail.x1}
                            x2={bar.rail.x2}
                            y1={bar.rail.y1}
                            y2={bar.rail.y2}
                          />
                        ) : null}
                        {bar.step.kind === "bucket" ? (
                          <rect
                            className="wf-ring"
                            x={round1(bar.barX - 4)}
                            y={bar.barY - 4}
                            width={round1(bar.barW + 8)}
                            height={bar.barH + 8}
                            rx={2}
                          />
                        ) : null}
                        <rect
                          className="wf-bar"
                          x={bar.barX}
                          y={bar.barY}
                          width={bar.barW}
                          height={bar.barH}
                          style={{
                            transformOrigin: origin,
                            animationDelay: `${delay}ms`,
                          }}
                        />
                        <text className="wf-name" x={0} y={round1(bar.cy - 3)}>
                          {bar.step.label}
                        </text>
                        <text className="wf-meta" x={0} y={round1(bar.cy + 14)}>
                          {bar.step.meta}
                        </text>
                        <rect className="wf-mark" x={0} y={round1(bar.cy + 20)} width={28} height={3} />
                        <text
                          className="wf-value"
                          x={layout.width}
                          y={round1(bar.cy + 5)}
                          textAnchor="end"
                          style={{ animationDelay: `${delay + 120}ms` }}
                        >
                          {bar.step.value.display}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
            <div className="wf-hits" style={layout.hitStyle}>
              {steps.map((step) => {
                if (step.kind === "bucket" && step.selectable) {
                  const label = `${step.label} Bucket, ${step.value.display}, ${plural(step.count ?? 0, "Contributor")}. Filters the Services table.`;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      className="wf-hit"
                      data-step={step.key}
                      data-bucket={step.key}
                      aria-pressed={selected === step.key}
                      aria-label={label}
                      aria-describedby={tooltipId}
                      onClick={() => onSelect(step.key as BucketKey)}
                      onPointerEnter={() => showTooltip(step.key)}
                      onFocus={(event) => {
                        focusedStepRef.current = step.key;
                        showTooltip(step.key);
                        event.currentTarget.setAttribute("aria-describedby", tooltipId);
                      }}
                      onBlur={hideTooltip}
                    />
                  );
                }
                return (
                  <div
                    key={step.key}
                    className="wf-hit wf-hit-static"
                    data-step={step.key}
                    onPointerEnter={() => showTooltip(step.key)}
                    onPointerLeave={hideTooltip}
                  />
                );
              })}
            </div>
            <div
              ref={tooltipRef}
              className="wf-tooltip"
              id={tooltipId}
              role="tooltip"
              hidden
            >
              {hoverStep ? <TooltipBody step={hoverStep} fileNames={fileNames} /> : null}
            </div>
          </>
        ) : null}
      </div>
      <p id={descId} className="sr-only">
        {description}
      </p>
    </figure>
  );
}
