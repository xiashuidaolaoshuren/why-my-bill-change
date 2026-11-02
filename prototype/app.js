/*
 * Why did my bill change? — application state, upload, chart, Bucket selection and the Services table.
 * Every figure on screen comes from window.BillEngine; nothing is formatted from a Number.
 */
(function () {
  'use strict';

  const Engine = window.BillEngine;
  const DEMOS = window.BillDemos;

  // Long enough for the pending state to register instead of flickering; no work is simulated.
  const MIN_PENDING_MS = 280;

  const SIDES = ['before', 'after'];
  const SIDE_LABEL = { before: 'Before bill', after: 'After bill' };
  const STATUS_LABEL = { added: 'Added', removed: 'Removed', changed: 'Changed', unchanged: 'Unchanged' };
  const STATUS_MARK = { added: '+', removed: '−', changed: '±', unchanged: '=' };
  const STATUS_ORDER = { added: 0, changed: 1, removed: 2, unchanged: 3 };
  const NAME_COLLATOR = new Intl.Collator('en', { sensitivity: 'variant', numeric: true });

  const CHART = {
    columnMinWidth: 600,
    figureCharWidth: 7.9, // 13px IBM Plex Mono advance, used to keep value labels from colliding
    padX: 8,
    top: 40,
    plotHeight: 240,
    bottom: 60,
    rowHeight: 56,
    rowBar: 18,
    rowPad: 8,
    stagger: 45,
  };

  const ICON_PATHS = {
    up: '<path d="M8 13V3.5M4 7.5 8 3.5l4 4"/>',
    down: '<path d="M8 3v9.5M4 8.5l4 4 4-4"/>',
    flat: '<path d="M3.5 6.5h9M3.5 9.5h9"/>',
    chevron: '<path d="M6 3.5 10.5 8 6 12.5"/>',
    sort: '<path d="M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3"/>',
    sortAsc: '<path d="M8 12.5V3.5M4.5 7 8 3.5 11.5 7"/>',
    sortDesc: '<path d="M8 3.5v9M4.5 9 8 12.5 11.5 9"/>',
    alert: '<path d="M8 2.5 14 13.5H2Z"/><path d="M8 6.75v3"/><path d="M8 11.6v.15"/>',
    check: '<path d="M3 8.5 6.5 12 13 4.5"/>',
  };

  const icon = (name, extraClass = '') =>
    `<svg class="od-icon ${extraClass}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;

  /* ---------- Small helpers ---------- */

  const byId = (id) => document.getElementById(id);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const compareBig = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const absBig = (value) => (value < 0n ? -value : value);
  const round1 = (value) => Math.round(value * 10) / 10;
  const toneOf = Engine.toneOf;

  function compareNames(a, b) {
    return NAME_COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  }

  function joinList(items) {
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function announce(message) {
    const region = byId('announcer');
    region.textContent = '';
    window.requestAnimationFrame(() => { region.textContent = message; });
  }

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  /* ---------- State ---------- */

  const defaultSort = () => ({ key: 'change', dir: 'desc', magnitude: false });

  const freshView = () => ({
    bucket: null,
    status: 'all',
    search: '',
    sort: defaultSort(),
    expanded: new Set(),
    animateChart: true,
  });

  const state = {
    view: 'upload',
    files: { before: null, after: null },
    comparison: null,
    errors: null,
    chart: null,
    ui: freshView(),
  };

  let comparisonRun = 0;

  function setView(view) {
    state.view = view;
    for (const name of ['upload', 'loading', 'result', 'error']) {
      byId(`view-${name}`).hidden = name !== view;
    }
    document.body.dataset.view = view;
  }

  const bucketByKey = (key) => state.comparison.bucketByKey[key];

  /* ---------- Upload state ---------- */

  function renderUpload() {
    for (const side of SIDES) {
      const zone = byId(`drop-${side}`);
      const file = state.files[side];
      zone.dataset.filled = String(Boolean(file));
      zone.querySelector('.dz-empty').hidden = Boolean(file);
      zone.querySelector('.dz-file').hidden = !file;
      if (file) {
        zone.querySelector('[data-file-name]').textContent = file.name;
        const kind = /\.csv$/i.test(file.name) ? 'CSV' : file.type || 'Unknown type';
        zone.querySelector('[data-file-meta]').textContent = `${formatBytes(file.size)} · ${kind}`;
        zone.querySelector('[data-remove]').setAttribute('aria-label', `Remove ${file.name} from the ${SIDE_LABEL[side]}`);
      }
    }

    const { before, after } = state.files;
    const ready = Boolean(before && after);
    const compare = byId('compare-button');
    const sample = byId('use-sample');
    compare.disabled = !ready;
    compare.classList.toggle('btn-primary', ready);
    compare.classList.toggle('btn-secondary', !ready);
    sample.classList.toggle('btn-primary', !ready);
    sample.classList.toggle('btn-secondary', ready);

    let hint = 'Add both bills to compare them.';
    if (ready) hint = `Ready to compare ${before.name} with ${after.name}.`;
    else if (before) hint = 'Add the After bill to compare.';
    else if (after) hint = 'Add the Before bill to compare.';
    byId('compare-hint').textContent = hint;
  }

  function setFile(side, file) {
    state.files[side] = file;
    renderUpload();
    announce(`${file.name} added as the ${SIDE_LABEL[side]}.`);
  }

  function removeFile(side) {
    const file = state.files[side];
    state.files[side] = null;
    renderUpload();
    byId(`drop-${side}`).querySelector('.dz-empty [data-choose]').focus();
    if (file) announce(`${file.name} removed from the ${SIDE_LABEL[side]}.`);
  }

  function makeFile({ name, text }) {
    return new File([text], name, { type: 'text/csv', lastModified: Date.now() });
  }

  function loadDemo(id) {
    const demo = DEMOS.find((d) => d.id === id);
    if (!demo) return;
    state.files = { before: makeFile(demo.before), after: makeFile(demo.after) };
    renderUpload();
    runComparison();
  }

  function renderDemoLinks() {
    byId('demo-list').innerHTML = DEMOS.filter((d) => d.id !== 'headline').map((d) => `
      <li><button type="button" class="demo-link" data-demo="${esc(d.id)}">
        <span class="demo-name">${esc(d.label)}</span>
        <span class="demo-blurb">${esc(d.blurb)}</span>
      </button></li>`).join('');
  }

  const hasFiles = (event) => Array.from((event.dataTransfer && event.dataTransfer.types) || []).includes('Files');

  function bindUpload() {
    const view = byId('view-upload');

    view.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const choose = event.target.closest('[data-choose]');
      if (choose) { byId(`file-${choose.dataset.choose}`).click(); return; }
      const remove = event.target.closest('[data-remove]');
      if (remove) { removeFile(remove.dataset.remove); return; }
      const demo = event.target.closest('[data-demo]');
      if (demo) loadDemo(demo.dataset.demo);
    });

    for (const side of SIDES) {
      const input = byId(`file-${side}`);
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) setFile(side, input.files[0]);
        input.value = '';
      });

      const zone = byId(`drop-${side}`);
      const markDragging = (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        zone.dataset.dragging = 'true';
      };
      zone.addEventListener('dragenter', markDragging);
      zone.addEventListener('dragover', markDragging);
      zone.addEventListener('dragleave', (event) => {
        if (!zone.contains(event.relatedTarget)) delete zone.dataset.dragging;
      });
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        delete zone.dataset.dragging;
        const file = event.dataTransfer && event.dataTransfer.files[0];
        if (file) setFile(side, file);
      });
    }

    // A file dropped outside a drop zone must not navigate the page away.
    window.addEventListener('dragover', (event) => {
      event.preventDefault();
      const inZone = event.target instanceof Element && event.target.closest('.dropzone');
      if (!inZone && event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    });
    window.addEventListener('drop', (event) => event.preventDefault());

    byId('use-sample').addEventListener('click', () => loadDemo('headline'));
    byId('compare-button').addEventListener('click', runComparison);
  }

  /* ---------- Running a Comparison ---------- */

  function readFileText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('unknown read error'));
      reader.readAsText(file);
    });
  }

  async function compareFiles(files) {
    const errors = [];
    const bills = {};
    await Promise.all(SIDES.map(async (side) => {
      const file = files[side];
      try {
        const text = await readFileText(file);
        bills[side] = Engine.parseBill(text, { side, fileName: file.name });
        errors.push(...bills[side].errors);
      } catch (error) {
        errors.push({
          side, fileName: file.name, line: null, column: null, source: null,
          message: `The file could not be read (${(error && error.message) || 'unknown error'}). Choose it again.`,
        });
      }
    }));
    if (errors.length) return { errors };
    try {
      return { comparison: Engine.compareBills(bills.before, bills.after) };
    } catch (error) {
      return { errors: [{ side: null, fileName: null, line: null, column: null, source: null, message: error.message }] };
    }
  }

  async function runComparison() {
    const files = { ...state.files };
    if (!files.before || !files.after) return;
    const run = ++comparisonRun;

    discardComparison();
    byId('loading-before').textContent = files.before.name;
    byId('loading-after').textContent = files.after.name;
    setView('loading');
    window.scrollTo({ top: 0 });
    byId('loading-title').focus({ preventScroll: true });

    const started = performance.now();
    const outcome = await compareFiles(files);
    const remaining = MIN_PENDING_MS - (performance.now() - started);
    if (remaining > 0) await wait(remaining);
    if (run !== comparisonRun) return;

    if (outcome.errors) showErrors(outcome.errors, files);
    else showResult(outcome.comparison);
  }

  // The previous Comparison disappears entirely, including everything rendered from it.
  function discardComparison() {
    state.comparison = null;
    state.errors = null;
    state.chart = null;
    state.ui = freshView();
    for (const id of ['summary-heading', 'stats', 'waterfall-canvas', 'waterfall-desc', 'bucket-chips',
      'reconciliation', 'ledger-body', 'rounding-notice', 'error-groups', 'result-files', 'services-meta']) {
      byId(id).innerHTML = '';
    }
    byId('rounding-notice').hidden = true;
    byId('bucket-filter').hidden = true;
    byId('bucket-clear').hidden = true;
    byId('service-search').value = '';
  }

  function startOver() {
    comparisonRun += 1;
    discardComparison();
    state.files = { before: null, after: null };
    renderUpload();
    setView('upload');
    window.scrollTo({ top: 0 });
    byId('use-sample').focus({ preventScroll: true });
    announce('Comparison cleared. Add two bills to start again.');
  }

  function backToUpload() {
    comparisonRun += 1;
    discardComparison();
    renderUpload();
    setView('upload');
    window.scrollTo({ top: 0 });
    byId('upload-title').focus({ preventScroll: true });
  }

  /* ---------- Error state ---------- */

  function showErrors(errors, files) {
    state.errors = errors;
    const fileNames = { before: files.before.name, after: files.after.name };
    const count = errors.length;
    byId('error-title').textContent = count === 1 ? 'One problem stops this Comparison' : `${count} problems stop this Comparison`;

    const failingSides = SIDES.filter((side) => errors.some((e) => e.side === side));
    byId('error-lede').textContent = failingSides.length
      ? `Fix ${joinList(failingSides.map((side) => fileNames[side]))}, then compare again. No totals, Buckets or chart are shown until both bills are valid.`
      : 'The Comparison could not be completed. Nothing from it is shown.';

    const byLine = (a, b) => (a.line ?? 0) - (b.line ?? 0);
    const groups = SIDES.map((side) =>
      errorGroupMarkup(SIDE_LABEL[side], fileNames[side], errors.filter((e) => e.side === side).sort(byLine), side));
    const general = errors.filter((e) => e.side === null);
    if (general.length) groups.push(errorGroupMarkup('Comparison', '', general, 'comparison'));
    byId('error-groups').innerHTML = groups.join('');

    setView('error');
    window.scrollTo({ top: 0 });
    byId('error-title').focus({ preventScroll: true });
  }

  function errorGroupMarkup(title, fileName, list, key) {
    const fileLine = fileName ? `<p class="error-file">${esc(fileName)}</p>` : '';
    if (!list.length) {
      return `<section class="error-group is-clean" aria-labelledby="error-${key}">
        <div class="error-group-head">
          <h2 class="error-group-title" id="error-${key}">${esc(title)}</h2>${fileLine}
          <p class="error-count">${icon('check')}<span>No problems found</span></p>
        </div>
      </section>`;
    }
    return `<section class="error-group" aria-labelledby="error-${key}">
      <div class="error-group-head">
        <h2 class="error-group-title" id="error-${key}">${esc(title)}</h2>${fileLine}
        <p class="error-count">${icon('alert')}<span>${plural(list.length, 'problem')}</span></p>
      </div>
      <table class="error-table">
        <thead><tr><th scope="col">Source line</th><th scope="col">Column</th><th scope="col">Message</th></tr></thead>
        <tbody>${list.map(errorRowMarkup).join('')}</tbody>
      </table>
    </section>`;
  }

  function errorRowMarkup(error) {
    const line = error.line === null ? 'Whole file' : error.line;
    const column = error.column ? `<code>${esc(error.column)}</code>` : '<span aria-label="No column">—</span>';
    const source = error.source !== null && error.source !== undefined
      ? `<code class="err-source">${esc(error.source) || '&nbsp;'}</code>` : '';
    return `<tr>
      <td class="err-line" data-label="Source line">${esc(line)}</td>
      <td class="err-col" data-label="Column">${column}</td>
      <td class="err-msg" data-label="Message"><div class="err-msg-body"><p>${esc(error.message)}</p>${source}</div></td>
    </tr>`;
  }

  /* ---------- Result state ---------- */

  function showResult(comparison) {
    state.comparison = comparison;
    state.ui = freshView();
    setView('result');
    renderResult();
    window.scrollTo({ top: 0 });
    byId('summary-heading').focus({ preventScroll: true });
  }

  function renderResult() {
    const c = state.comparison;
    byId('result-files').textContent = `${c.before.fileName} → ${c.after.fileName}`;
    renderSummary(c);
    renderNotice(c);
    renderStats(c);
    renderChart();
    renderBucketChips(c);
    renderReconciliation(c);
    renderSelection();
  }

  function renderSummary(c) {
    byId('summary-heading').innerHTML = c.summary.parts.map((part) => (part.type === 'amount'
      ? `<span class="sum-amount tone-${part.tone}">${esc(part.text)}</span>`
      : esc(part.text))).join('');
  }

  function renderNotice(c) {
    const rounding = c.displayRounding;
    const notice = byId('rounding-notice');
    notice.hidden = !rounding.needed;
    if (!rounding.needed) { notice.innerHTML = ''; return; }
    const fig = (text) => `<span class="figure">${esc(text)}</span>`;
    const sentences = [];
    if (rounding.bucketsMismatch) {
      sentences.push(`The displayed Buckets add up to ${fig(rounding.displayedBucketSum)}, but the displayed Total change is ${fig(c.totalChange.display)}.`);
    }
    if (rounding.waterfallMismatch) {
      sentences.push(`Stepping through the displayed waterfall from ${fig(c.beforeTotal.display)} reaches ${fig(rounding.displayedStepsEnd)}, not the displayed after total of ${fig(c.afterTotal.display)}.`);
    }
    notice.innerHTML = `
      <p class="notice-title">${icon('alert')}<span>Display rounding</span></p>
      <p class="notice-body">${sentences.join(' ')} Each amount is rounded to the cent on its own. The exact values still reconcile: hover a bar or expand a row to see them.</p>`;
  }

  function renderStats(c) {
    const changeTone = toneOf(c.totalChange.units);
    const direction = { up: 'Bill increased', down: 'Bill decreased', flat: 'Bill did not change' }[changeTone];
    byId('stats').innerHTML = [
      statMarkup('Before total', c.beforeTotal, `${plural(c.before.serviceCount, 'Service')} · ${c.before.fileName}`),
      statMarkup('After total', c.afterTotal, `${plural(c.after.serviceCount, 'Service')} · ${c.after.fileName}`),
      statMarkup('Total change', c.totalChange, direction, changeTone),
    ].join('');
  }

  function statMarkup(label, value, meta, tone) {
    const exact = value.isCentExact ? '' : `<p class="stat-exact">Exact ${esc(value.exactText)}</p>`;
    return `<div class="stat${tone ? ` stat-change tone-${tone}` : ''}">
      <p class="stat-label">${esc(label)}</p>
      <p class="stat-value">${tone ? icon(tone, 'stat-icon') : ''}<span>${esc(value.display)}</span></p>
      <p class="stat-meta">${esc(meta)}</p>${exact}
    </div>`;
  }

  function renderReconciliation(c) {
    const term = (name, value) => `<span class="rec-term"><span class="rec-name">${esc(name)}</span><span class="rec-value">${esc(value.exactText)}</span></span>`;
    const op = (symbol) => `<span class="rec-op" aria-hidden="true">${symbol}</span>`;
    const pieces = [term('Before total', c.beforeTotal)];
    for (const bucket of c.buckets) pieces.push(op('+'), term(bucket.label, bucket.total));
    pieces.push(op('='), term('After total', c.afterTotal));
    const spoken = `Before total ${c.beforeTotal.exactText}, ${c.buckets.map((b) => `${b.label} ${b.total.exactText}`).join(', ')}, equals after total ${c.afterTotal.exactText}.`;
    byId('reconciliation').innerHTML = `
      <p class="label">Reconciliation, exact values</p>
      <p class="rec-equation" aria-label="${esc(spoken)}">${pieces.join('')}</p>
      <p class="rec-status">${icon('check')}<span>Holds exactly: before total plus every Bucket equals the after total.</span></p>`;
  }

  /* ---------- Waterfall chart ---------- */

  function chartSteps(c) {
    const steps = [{
      key: 'before', kind: 'total', label: 'Before total', meta: plural(c.before.serviceCount, 'Service'),
      start: 0n, end: c.beforeTotal.units, value: c.beforeTotal, tone: 'total', fileName: c.before.fileName,
    }];
    let level = c.beforeTotal.units;
    for (const bucket of c.buckets) {
      const start = level;
      level += bucket.total.units;
      const count = bucket.contributors.length;
      steps.push({
        key: bucket.key, kind: 'bucket', label: bucket.label,
        meta: count ? plural(count, 'Contributor') : 'No Contributors',
        start, end: level, value: bucket.total, tone: toneOf(bucket.total.units), selectable: count > 0, count,
      });
    }
    steps.push({
      key: 'after', kind: 'total', label: 'After total', meta: plural(c.after.serviceCount, 'Service'),
      start: 0n, end: c.afterTotal.units, value: c.afterTotal, tone: 'total', fileName: c.after.fileName,
    });
    return steps;
  }

  function chartDomain(steps) {
    const values = steps.flatMap((s) => [Engine.approximate(s.start), Engine.approximate(s.end)]);
    const lo = Math.min(0, ...values);
    let hi = Math.max(0, ...values);
    if (hi === lo) hi = lo + 1;
    return { lo, hi };
  }

  function stepGroupOpen(step, extraClass = '') {
    return `<g class="wf-step tone-${step.tone} ${step.kind === 'bucket' ? 'is-bucket' : 'is-total'} ${extraClass}" data-bar="${step.key}">`;
  }

  function drawColumns(steps, width) {
    const { padX, top, plotHeight, bottom, stagger } = CHART;
    const height = top + plotHeight + bottom;
    const { lo, hi } = chartDomain(steps);
    const band = (width - padX * 2) / steps.length;
    const barWidth = round1(Math.min(band * 0.56, 96));
    const y = (v) => round1(top + ((hi - v) / (hi - lo)) * plotHeight);
    const anchors = {};
    const marks = [];
    const zeroY = y(0);

    steps.forEach((step, i) => {
      const cx = round1(padX + band * (i + 0.5));
      const x = round1(cx - barWidth / 2);
      const a = Engine.approximate(step.start);
      const b = Engine.approximate(step.end);
      const yTop = y(Math.max(a, b));
      const yBottom = y(Math.min(a, b));
      const flat = yBottom - yTop < 2;
      const barY = flat ? round1(y(b) - 1) : yTop;
      const barH = flat ? 2 : round1(yBottom - yTop);
      const growsDown = step.kind === 'bucket' && step.end < step.start;
      const origin = growsDown ? 'center top' : 'center bottom';
      anchors[step.key] = { x: cx, top: barY, bottom: barY + barH };

      const rail = i < steps.length - 1
        ? `<line class="wf-rail" x1="${round1(x + barWidth)}" x2="${round1(x + band)}" y1="${y(b)}" y2="${y(b)}"/>` : '';
      const ring = step.kind === 'bucket'
        ? `<rect class="wf-ring" x="${x - 4}" y="${round1(barY - 4)}" width="${barWidth + 8}" height="${round1(barH + 8)}" rx="2"/>` : '';
      const labelY = height - bottom + 24;

      marks.push(`${rail}${stepGroupOpen(step)}
        ${ring}
        <rect class="wf-bar" x="${x}" y="${barY}" width="${barWidth}" height="${barH}" style="transform-origin:${origin};animation-delay:${i * stagger}ms"/>
        <text class="wf-value" x="${cx}" y="${round1(barY - 10)}" text-anchor="middle" style="animation-delay:${i * stagger + 120}ms">${esc(step.value.display)}</text>
        <text class="wf-name" x="${cx}" y="${labelY}" text-anchor="middle">${esc(step.label)}</text>
        <text class="wf-meta" x="${cx}" y="${labelY + 18}" text-anchor="middle">${esc(step.meta)}</text>
        <rect class="wf-mark" x="${cx - 14}" y="${labelY + 28}" width="28" height="3"/>
      </g>`);
    });

    const svg = `<line class="wf-baseline" x1="0" x2="${width}" y1="${zeroY}" y2="${zeroY}"/>${marks.join('')}`;
    const hitStyle = `grid-template-columns:repeat(${steps.length},minmax(0,1fr));padding-inline:${padX}px;height:${height}px`;
    return { svg, height, hitStyle, anchors };
  }

  function drawRows(steps, width) {
    const { rowHeight, rowBar, rowPad, stagger, figureCharWidth } = CHART;
    const labelWidth = Math.min(Math.max(width * 0.3, 112), 156);
    const valueWidth = Math.max(...steps.map((s) => s.value.display.length)) * figureCharWidth + 12;
    const x0 = labelWidth + 8;
    const x1 = Math.max(x0 + 48, width - valueWidth - 8);
    const height = rowPad * 2 + rowHeight * steps.length;
    const { lo, hi } = chartDomain(steps);
    const x = (v) => round1(x0 + ((v - lo) / (hi - lo)) * (x1 - x0));
    const anchors = {};
    const marks = [];
    const zeroX = x(0);

    steps.forEach((step, i) => {
      const cy = rowPad + rowHeight * (i + 0.5);
      const a = Engine.approximate(step.start);
      const b = Engine.approximate(step.end);
      const left = x(Math.min(a, b));
      const right = x(Math.max(a, b));
      const flat = right - left < 2;
      const barX = flat ? round1(x(b) - 1) : left;
      const barW = flat ? 2 : round1(right - left);
      const barY = round1(cy - rowBar / 2);
      const growsLeft = step.kind === 'bucket' && step.end < step.start;
      const origin = growsLeft ? 'right center' : 'left center';
      anchors[step.key] = { x: round1(barX + barW / 2), top: barY, bottom: barY + rowBar };

      const rail = i < steps.length - 1
        ? `<line class="wf-rail" x1="${x(b)}" x2="${x(b)}" y1="${barY + rowBar}" y2="${round1(cy + rowHeight - rowBar / 2)}"/>` : '';
      const ring = step.kind === 'bucket'
        ? `<rect class="wf-ring" x="${round1(barX - 4)}" y="${barY - 4}" width="${round1(barW + 8)}" height="${rowBar + 8}" rx="2"/>` : '';

      marks.push(`${rail}${stepGroupOpen(step)}
        ${ring}
        <rect class="wf-bar" x="${barX}" y="${barY}" width="${barW}" height="${rowBar}" style="transform-origin:${origin};animation-delay:${i * stagger}ms"/>
        <text class="wf-name" x="0" y="${round1(cy - 3)}">${esc(step.label)}</text>
        <text class="wf-meta" x="0" y="${round1(cy + 14)}">${esc(step.meta)}</text>
        <rect class="wf-mark" x="0" y="${round1(cy + 20)}" width="28" height="3"/>
        <text class="wf-value" x="${width}" y="${round1(cy + 5)}" text-anchor="end" style="animation-delay:${i * stagger + 120}ms">${esc(step.value.display)}</text>
      </g>`);
    });

    const svg = `<line class="wf-baseline" x1="${zeroX}" x2="${zeroX}" y1="${rowPad}" y2="${height - rowPad}"/>${marks.join('')}`;
    const hitStyle = `grid-template-rows:repeat(${steps.length},${rowHeight}px);padding-block:${rowPad}px;height:${height}px`;
    return { svg, height, hitStyle, anchors };
  }

  function hitMarkup(step) {
    if (step.kind === 'bucket' && step.selectable) {
      const label = `${step.label} Bucket, ${step.value.display}, ${plural(step.count, 'Contributor')}. Filters the Services table.`;
      return `<button type="button" class="wf-hit" data-step="${step.key}" data-bucket="${step.key}" aria-pressed="false" aria-label="${esc(label)}" aria-describedby="wf-tooltip"></button>`;
    }
    return `<div class="wf-hit wf-hit-static" data-step="${step.key}"></div>`;
  }

  function chartDescription(steps) {
    const parts = steps.map((s) => (s.kind === 'total'
      ? `${s.label} ${s.value.display}`
      : `${s.label} ${s.value.display} from ${s.count ? plural(s.count, 'Contributor') : 'no Contributors'}`));
    return `Waterfall chart. ${parts.join('; ')}.`;
  }

  function renderChart() {
    const c = state.comparison;
    const canvas = byId('waterfall-canvas');
    if (!c || state.view !== 'result') return;
    const width = Math.floor(canvas.clientWidth);
    if (width <= 0) return;

    const steps = chartSteps(c);
    const widestLabel = Math.max(...steps.map((s) => s.value.display.length)) * CHART.figureCharWidth;
    const band = (width - CHART.padX * 2) / steps.length;
    const mode = width >= CHART.columnMinWidth && band >= widestLabel + 16 ? 'columns' : 'rows';
    const focusedStep = canvas.contains(document.activeElement) ? document.activeElement.dataset.step : null;
    const drawing = mode === 'columns' ? drawColumns(steps, width) : drawRows(steps, width);

    canvas.dataset.mode = mode;
    canvas.innerHTML = `
      <svg class="wf-svg${state.ui.animateChart ? ' wf-entering' : ''}" viewBox="0 0 ${width} ${drawing.height}" width="${width}" height="${drawing.height}" role="img" aria-labelledby="waterfall-caption" aria-describedby="waterfall-desc">${drawing.svg}</svg>
      <div class="wf-hits" style="${drawing.hitStyle}">${steps.map(hitMarkup).join('')}</div>
      <div class="wf-tooltip" id="wf-tooltip" role="tooltip" hidden></div>`;

    state.chart = { width, mode, steps, anchors: drawing.anchors };
    state.ui.animateChart = false;
    byId('waterfall-desc').textContent = chartDescription(steps);
    updateChartSelection();
    if (focusedStep) {
      const again = canvas.querySelector(`button.wf-hit[data-step="${focusedStep}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function updateChartSelection() {
    const canvas = byId('waterfall-canvas');
    const key = state.ui.bucket;
    canvas.classList.toggle('has-selection', Boolean(key));
    all('[data-bar]', canvas).forEach((group) => group.classList.toggle('is-selected', group.dataset.bar === key));
    all('button.wf-hit', canvas).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.bucket === key)));
  }

  function tooltipMarkup(step) {
    const row = (key, value) => `<div class="tt-row"><span class="tt-key">${esc(key)}</span><span class="tt-val">${esc(value)}</span></div>`;
    const rows = [row('Displayed', step.value.display), row('Exact', step.value.exactText)];
    let foot;
    if (step.kind === 'bucket') {
      rows.push(row('From', Engine.money(step.start).exactText), row('To', Engine.money(step.end).exactText));
      foot = step.selectable ? `${plural(step.count, 'Contributor')} · select to filter the table` : 'No Contributors in this Bucket';
    } else {
      foot = `${step.meta} in ${step.fileName}`;
    }
    const title = step.kind === 'bucket' ? `${step.label} Bucket` : step.label;
    return `<span class="tt-title">${esc(title)}</span>${rows.join('')}<span class="tt-foot">${esc(foot)}</span>`;
  }

  function showTooltip(stepKey) {
    const chart = state.chart;
    const tip = byId('wf-tooltip');
    if (!chart || !tip) return;
    const step = chart.steps.find((s) => s.key === stepKey);
    const anchor = chart.anchors[stepKey];
    if (!step || !anchor) return;

    tip.innerHTML = tooltipMarkup(step);
    tip.hidden = false;
    const canvasWidth = byId('waterfall-canvas').clientWidth;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const left = Math.max(0, Math.min(anchor.x - tipWidth / 2, canvasWidth - tipWidth));
    let top = anchor.top - tipHeight - 12;
    if (top < 0) top = anchor.bottom + 12;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;

    all('[data-bar]', byId('waterfall-canvas')).forEach((group) => group.classList.toggle('is-hover', group.dataset.bar === stepKey));
  }

  function hideTooltip() {
    const tip = byId('wf-tooltip');
    if (tip) tip.hidden = true;
    all('.wf-step.is-hover', byId('waterfall-canvas')).forEach((group) => group.classList.remove('is-hover'));
  }

  function bindChart() {
    const canvas = byId('waterfall-canvas');
    canvas.addEventListener('pointerover', (event) => {
      const hit = event.target instanceof Element && event.target.closest('.wf-hit');
      if (hit) showTooltip(hit.dataset.step);
    });
    canvas.addEventListener('pointerleave', hideTooltip);
    canvas.addEventListener('focusin', (event) => {
      const hit = event.target instanceof Element && event.target.closest('.wf-hit');
      if (hit) showTooltip(hit.dataset.step);
    });
    canvas.addEventListener('focusout', hideTooltip);
    canvas.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTooltip(); });
  }

  /* ---------- Bucket selector ---------- */

  function renderBucketChips(c) {
    const selectable = c.buckets.filter((b) => b.contributors.length > 0);
    const idle = c.buckets.filter((b) => b.contributors.length === 0);
    const chips = byId('bucket-chips');
    chips.hidden = selectable.length === 0;
    chips.innerHTML = selectable.map((bucket) => {
      const tone = toneOf(bucket.total.units);
      const exactTitle = bucket.total.isCentExact ? '' : ` title="Exact ${esc(bucket.total.exactText)}"`;
      return `<button type="button" class="chip tone-${tone}" data-bucket="${bucket.key}" aria-pressed="false">
        <span class="chip-name">${icon(tone, 'chip-icon')}<span>${esc(bucket.label)}</span></span>
        <span class="chip-amount"${exactTitle}>${esc(bucket.total.display)}</span>
        <span class="chip-count">${plural(bucket.contributors.length, 'Contributor')}</span>
      </button>`;
    }).join('');

    const note = byId('bucket-note');
    if (selectable.length === 0) {
      note.textContent = 'No Bucket has Contributors: every Service has the same Quantity and unit price in both bills.';
    } else {
      note.textContent = idle.length ? `No Contributors in ${joinList(idle.map((b) => b.label))}.` : '';
    }
    note.hidden = note.textContent === '';
  }

  function updateChips() {
    const key = state.ui.bucket;
    all('.chip', byId('bucket-chips')).forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.bucket === key)));
    byId('bucket-clear').hidden = !key;
  }

  function selectBucket(key) {
    const ui = state.ui;
    ui.bucket = ui.bucket === key ? null : key;
    ui.status = 'all';
    ui.sort = ui.bucket ? { key: 'change', dir: 'desc', magnitude: true } : defaultSort();
    renderSelection();
    if (ui.bucket) {
      const bucket = bucketByKey(ui.bucket);
      announce(`${bucket.label} Bucket selected: ${bucket.total.display} from ${plural(bucket.contributors.length, 'Contributor')}, largest Bucket contribution first.`);
    } else {
      announce('Bucket selection cleared. The table lists every Service.');
    }
  }

  function clearBucket() {
    const previous = state.ui.bucket;
    if (!previous) return;
    selectBucket(previous);
    const chip = byId('bucket-chips').querySelector(`[data-bucket="${previous}"]`);
    if (chip) chip.focus();
  }

  function renderSelection() {
    updateChartSelection();
    updateChips();
    renderTable();
  }

  /* ---------- Services table ---------- */

  function visibleServices() {
    const c = state.comparison;
    const { bucket, status, search } = state.ui;
    const query = search.trim().toLowerCase();
    let scope = bucket ? bucketByKey(bucket).contributors : c.services;
    if (query) scope = scope.filter((s) => s.name.toLowerCase().includes(query));
    const counts = { all: scope.length, added: 0, removed: 0, changed: 0, unchanged: 0 };
    scope.forEach((s) => { counts[s.status] += 1; });
    const rows = status === 'all' ? scope : scope.filter((s) => s.status === status);
    return { rows: sortServices(rows), counts };
  }

  function sortServices(list) {
    const { sort, bucket } = state.ui;
    const direction = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (s) => {
      switch (sort.key) {
        case 'status': return BigInt(STATUS_ORDER[s.status]);
        case 'before': return s.before ? s.before.cost.units : null;
        case 'after': return s.after ? s.after.cost.units : null;
        case 'change': {
          const units = bucket ? s.contributions[bucket].units : s.totalChange.units;
          return sort.magnitude ? absBig(units) : units;
        }
        default: return null;
      }
    };
    return [...list].sort((a, b) => {
      if (sort.key === 'service') return direction * compareNames(a.name, b.name);
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === null || vb === null) {
        // A Service missing from that bill has no Cost there; it sorts last in either direction.
        if (va !== vb) return va === null ? 1 : -1;
      } else {
        const order = compareBig(va, vb);
        if (order !== 0) return direction * order;
      }
      return compareNames(a.name, b.name);
    });
  }

  function renderTableHead() {
    const { sort, bucket } = state.ui;
    const head = byId('ledger').tHead;
    all('th[data-col]', head).forEach((th) => {
      const active = th.dataset.col === sort.key;
      if (active) th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      th.classList.toggle('is-sorted', active);
      th.querySelector('.sort-icon').innerHTML = icon(active ? (sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sort');
    });
    head.querySelector('th[data-col="change"]').classList.toggle('is-bucket', Boolean(bucket));
    byId('change-col-name').textContent = bucket ? `${bucketByKey(bucket).label}` : 'Total change';
    const sub = byId('change-col-sub');
    sub.hidden = !bucket;
    sub.textContent = sort.key === 'change' && sort.magnitude ? 'Bucket contribution · by size' : 'Bucket contribution';
  }

  function renderTable() {
    const c = state.comparison;
    if (!c) return;
    const ui = state.ui;
    const { rows, counts } = visibleServices();

    all('.segmented [data-status]', byId('view-result')).forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.status === ui.status));
      button.querySelector('[data-count]').textContent = String(counts[button.dataset.status]);
    });

    renderTableHead();
    byId('ledger-body').innerHTML = rows.map(rowMarkup).join('');

    const empty = rows.length === 0;
    byId('table-wrap').hidden = empty;
    byId('ledger-empty').hidden = !empty;
    if (empty) {
      byId('ledger-empty-body').textContent = emptyMessage();
      byId('ledger-empty-clear').hidden = c.services.length === 0;
    }

    const banner = byId('bucket-filter');
    banner.hidden = !ui.bucket;
    if (ui.bucket) {
      const bucket = bucketByKey(ui.bucket);
      byId('bucket-filter-text').textContent =
        `Showing the ${plural(bucket.contributors.length, 'Contributor')} to the ${bucket.label} Bucket (${bucket.total.display}). The money column shows each Bucket contribution.`;
    }
    byId('services-meta').textContent = `${rows.length} of ${plural(c.services.length, 'Service')} shown`;
  }

  function emptyMessage() {
    const c = state.comparison;
    const { search, status, bucket } = state.ui;
    if (c.services.length === 0) return 'Neither bill lists a Service, so there is nothing to compare row by row.';
    const filters = [];
    if (search.trim()) filters.push(`the search “${search.trim()}”`);
    if (status !== 'all') filters.push(`the status ${STATUS_LABEL[status]}`);
    if (bucket) filters.push(`the ${bucketByKey(bucket).label} Bucket`);
    return `No Service matches ${joinList(filters)}. Clear the filters to see all ${plural(c.services.length, 'Service')}.`;
  }

  function moneyMarkup(value) {
    const tone = toneOf(value.units);
    const exactTitle = value.isCentExact ? '' : ` title="Exact ${esc(value.exactText)}"`;
    return `<span class="money tone-${tone}"${exactTitle}>${icon(tone)}<span>${esc(value.display)}</span></span>`;
  }

  function costMarkup(line) {
    if (!line) return '<span class="absent-mark" aria-hidden="true">—</span><span class="sr-only">Not in this bill</span>';
    const exactTitle = line.cost.isCentExact ? '' : ` title="Exact ${esc(line.cost.exactText)}"`;
    return `<span class="money"${exactTitle}>${esc(line.cost.display)}</span>`;
  }

  function rowMarkup(s) {
    const { bucket, expanded } = state.ui;
    const open = expanded.has(s.id);
    const value = bucket ? s.contributions[bucket] : s.totalChange;
    return `<tr class="svc-row${open ? ' is-expanded' : ''}" data-id="${s.id}">
      <th scope="row" class="col-service">
        <button type="button" class="row-toggle" aria-expanded="${open}" aria-controls="${s.id}-detail">${icon('chevron', 'row-chevron')}<span class="service-name">${esc(s.name)}</span></button>
      </th>
      <td class="col-status"><span class="status status-${s.status}"><span class="status-mark" aria-hidden="true">${STATUS_MARK[s.status]}</span><span>${STATUS_LABEL[s.status]}</span></span></td>
      <td class="num">${costMarkup(s.before)}</td>
      <td class="num">${costMarkup(s.after)}</td>
      <td class="num col-change${bucket ? ' is-bucket' : ''}">${moneyMarkup(value)}</td>
    </tr>
    <tr class="detail-row" id="${s.id}-detail"${open ? '' : ' hidden'}>
      <td colspan="5"><div class="detail" role="region" aria-label="${esc(`${s.name}: Source lines and worked formula`)}">${detailMarkup(s)}</div></td>
    </tr>`;
  }

  function billPanel(side, line, fileName) {
    if (!line) {
      return `<section class="bill-panel">
        <h3 class="detail-label">${SIDE_LABEL[side]}</h3>
        <p class="bill-source">${esc(fileName)}</p>
        <p class="bill-absent">Not in this bill</p>
      </section>`;
    }
    const exactNote = (value) => (value.isCentExact ? '' : `<span class="exact">exact ${esc(value.exactText)}</span>`);
    return `<section class="bill-panel">
      <h3 class="detail-label">${SIDE_LABEL[side]}</h3>
      <p class="bill-source">${esc(fileName)} · Source line ${line.line}</p>
      <dl class="facts">
        <div><dt>Quantity</dt><dd><span>${esc(line.quantity.text)}</span></dd></div>
        <div><dt>Unit price</dt><dd><span>${esc(line.unitPrice.money.display)}</span>${exactNote(line.unitPrice.money)}<span class="per">per Quantity unit</span></dd></div>
        <div><dt>Cost</dt><dd><span>${esc(line.cost.display)}</span>${exactNote(line.cost)}</dd></div>
      </dl>
    </section>`;
  }

  // Each formula is written twice: with display strings, and with exact values when rounding hides digits.
  function formulaLines(s) {
    const b = s.before;
    const a = s.after;
    const D = (value) => value.display;
    const X = (value) => value.exactText;
    const line = (key, term, display, exact, values) => ({ key, term, display, exact, values });

    switch (s.status) {
      case 'added':
        return [line('added', 'Added',
          `${a.quantity.text} × ${D(a.unitPrice.money)} = ${D(s.totalChange)}`,
          `${a.quantity.text} × ${X(a.unitPrice.money)} = ${X(s.totalChange)}`,
          [a.unitPrice.money, s.totalChange])];
      case 'removed':
        return [line('removed', 'Removed',
          `−(${b.quantity.text} × ${D(b.unitPrice.money)}) = ${D(s.totalChange)}`,
          `−(${b.quantity.text} × ${X(b.unitPrice.money)}) = ${X(s.totalChange)}`,
          [b.unitPrice.money, s.totalChange])];
      case 'changed':
        return [
          line('usage', 'Usage effect',
            `(${a.quantity.text} − ${b.quantity.text}) × ${D(b.unitPrice.money)} = ${D(s.usageEffect)}`,
            `(${a.quantity.text} − ${b.quantity.text}) × ${X(b.unitPrice.money)} = ${X(s.usageEffect)}`,
            [b.unitPrice.money, s.usageEffect]),
          line('price', 'Price effect',
            `(${D(a.unitPrice.money)} − ${D(b.unitPrice.money)}) × ${a.quantity.text} = ${D(s.priceEffect)}`,
            `(${X(a.unitPrice.money)} − ${X(b.unitPrice.money)}) × ${a.quantity.text} = ${X(s.priceEffect)}`,
            [a.unitPrice.money, b.unitPrice.money, s.priceEffect]),
          line('total', 'Total change',
            `${D(a.cost)} − ${D(b.cost)} = ${D(s.totalChange)}`,
            `${X(a.cost)} − ${X(b.cost)} = ${X(s.totalChange)}`,
            [a.cost, b.cost, s.totalChange]),
        ];
      default:
        return [line('total', 'Total change',
          `${D(a.cost)} − ${D(b.cost)} = ${D(s.totalChange)}`,
          `${X(a.cost)} − ${X(b.cost)} = ${X(s.totalChange)}`,
          [a.cost, b.cost, s.totalChange])];
    }
  }

  function detailMarkup(s) {
    const c = state.comparison;
    const active = state.ui.bucket;
    const lines = formulaLines(s);
    const formulas = lines.map((l) => {
      const needsExact = l.values.some((value) => !value.isCentExact);
      return `<div class="formula${l.key === active ? ' is-active' : ''}">
        <dt>${esc(l.term)}</dt>
        <dd><code>${esc(l.display)}</code>${needsExact ? `<span class="exact">exact <code>${esc(l.exact)}</code></span>` : ''}</dd>
      </div>`;
    }).join('');
    const allCentExact = lines.every((l) => l.values.every((value) => value.isCentExact));
    let note = '';
    if (s.status === 'unchanged') note = '<p class="formula-note">Same Quantity and unit price in both bills, so this Service is not a Contributor.</p>';
    else if (s.status === 'changed') note = '<p class="formula-note">Usage effect + Price effect = Total change.</p>';
    const exactness = allCentExact ? '<p class="formula-note">Every value here is exact to the cent.</p>' : '';

    return `<div class="detail-grid">
      ${billPanel('before', s.before, c.before.fileName)}
      ${billPanel('after', s.after, c.after.fileName)}
      <section class="formula-panel">
        <h3 class="detail-label">Worked formula</h3>
        <dl class="formulas">${formulas}</dl>
        ${note}${exactness}
      </section>
    </div>`;
  }

  function toggleRow(button) {
    const row = button.closest('tr');
    const id = row.dataset.id;
    const open = !state.ui.expanded.has(id);
    if (open) state.ui.expanded.add(id);
    else state.ui.expanded.delete(id);
    button.setAttribute('aria-expanded', String(open));
    row.classList.toggle('is-expanded', open);
    byId(`${id}-detail`).hidden = !open;
  }

  function sortBy(key) {
    const sort = state.ui.sort;
    if (sort.key === key) {
      sort.dir = sort.dir === 'desc' ? 'asc' : 'desc';
    } else {
      sort.key = key;
      sort.dir = key === 'service' || key === 'status' ? 'asc' : 'desc';
      sort.magnitude = key === 'change' && Boolean(state.ui.bucket);
    }
    renderTable();
  }

  function setStatus(status) {
    state.ui.status = status;
    renderTable();
  }

  function clearFilters() {
    const ui = state.ui;
    ui.search = '';
    ui.status = 'all';
    ui.bucket = null;
    ui.sort = defaultSort();
    byId('service-search').value = '';
    renderSelection();
    byId('service-search').focus();
    announce('Filters cleared. The table lists every Service.');
  }

  function renderSkeletonRows() {
    byId('skeleton-rows').innerHTML = Array.from({ length: 6 }, () => `<tr>
      <th class="col-service"><span class="skel skel-text"></span></th>
      <td><span class="skel skel-badge"></span></td>
      <td><span class="skel skel-money"></span></td>
      <td><span class="skel skel-money"></span></td>
      <td><span class="skel skel-money"></span></td>
    </tr>`).join('');
  }

  /* ---------- Wiring ---------- */

  const ACTIONS = {
    'start-over': startOver,
    'back-to-upload': backToUpload,
    'clear-bucket': clearBucket,
    'clear-filters': clearFilters,
  };

  function bindResult() {
    const view = byId('view-result');
    view.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      const bucketButton = target.closest('button[data-bucket]');
      if (bucketButton) { selectBucket(bucketButton.dataset.bucket); return; }
      const sortButton = target.closest('[data-sort]');
      if (sortButton) { sortBy(sortButton.dataset.sort); return; }
      const toggle = target.closest('.row-toggle');
      if (toggle) { toggleRow(toggle); return; }
      const statusButton = target.closest('.segmented [data-status]');
      if (statusButton) setStatus(statusButton.dataset.status);
    });

    byId('service-search').addEventListener('input', (event) => {
      state.ui.search = event.target.value;
      renderTable();
    });

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const action = event.target.closest('[data-action]');
      if (action && ACTIONS[action.dataset.action]) ACTIONS[action.dataset.action]();
    });

    bindChart();
  }

  function observeSizes() {
    let frame = 0;
    const scheduleChart = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!state.comparison || state.view !== 'result') return;
        const width = Math.floor(byId('waterfall-canvas').clientWidth);
        if (!state.chart || state.chart.width !== width) renderChart();
      });
    };

    const tableWrap = byId('table-wrap');
    const syncDetailWidth = () => tableWrap.style.setProperty('--wrap-w', `${Math.floor(tableWrap.clientWidth)}px`);

    if ('ResizeObserver' in window) {
      new ResizeObserver(scheduleChart).observe(byId('waterfall-canvas'));
      new ResizeObserver(syncDetailWidth).observe(tableWrap);
    } else {
      window.addEventListener('resize', () => { scheduleChart(); syncDetailWidth(); });
    }
  }

  function init() {
    if (!Engine || !DEMOS) return;
    renderDemoLinks();
    renderSkeletonRows();
    bindUpload();
    bindResult();
    observeSizes();
    renderUpload();
    setView('upload');
  }

  init();
})();
