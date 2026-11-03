# Implementation plan: Why did my bill change?

**Spec:** [docs/superpowers/specs/2026-10-31-bill-change-explorer-design.md](../specs/2026-10-31-bill-change-explorer-design.md)
**Created:** 2026-11-02
**Goal scope:** One product. Compare two HKD bills and explain the total change so that it reconciles exactly. **Two slices** (backend, then frontend), each with **several subtasks** (`B1`–`B4`, then `F1`–`F6`).

## Summary

Ship a stateless Next.js app. A reviewer runs one Docker image, uploads two CSVs (or the sample files), and sees a summary sentence, a waterfall, and a searchable table whose buckets add back to the after total.

This plan has **two slices**. Each slice is a sequence of subtasks. Finish every subtask in slice 1 before starting slice 2.

**Slice 1 — Backend** (`B1` → `B2` → `B3` → `B4`): scaffold and money, parse and validate, compare and present, then the API route and reviewer samples.

**Slice 2 — Frontend** (`F1` → `F2` → `F3` → `F4` → `F5` → `F6`): shell and tokens, upload and pending, headline block, waterfall and buckets, table and errors, then Playwright, Docker, CI, and docs.

Out of scope stays section 11 of the spec: other currencies, a quantity-unit column, real cloud-export formats, fuzzy names, persistence, more than two periods, and a public host. `prototype/` is the reference and is not ported into the app.

## Discovery notes

- Reuse: `CONTEXT.md` for the words on screen and in code. `prototype/` for layout, copy, and the interactions section 8 settled. `prototype/exact.js` for behavior already checked (headline sentence, rounding notice, reconciliation). Do not copy its BigInt arithmetic into `src/core`.
- Constraints: Next.js App Router, React, TypeScript, Node runtime. Tailwind and shadcn/ui. Recharts for the chart. decimal.js for money, precision at least 80, display rounding `ROUND_HALF_UP`. No `parseFloat` and no `Number(` in `src/core`. The browser renders server strings and does not calculate or round money.
- Patterns to follow: the spec's units (`parse`, `validate`, `compare`, `summary`, a thin route). The prototype's four views (upload, pending, result, error).
- Anti-goals: no drive-by restyle of `prototype/`. No extra buckets, periods, or currencies. No database, login, or stored uploads. Do not split this into two plans.

## File map

Paths below are proposals. The app does not exist yet. An internal file may move during a slice without a new subtask; the JSON contract may not.

### Backend slice

| Path | Create/Modify | Responsibility | Public surface | Verified/Provisional |
|------|---------------|----------------|----------------|---------------------|
| `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts` | create | App and test runner | `npm test`, `npm run typecheck` | provisional |
| `src/core/money.ts` | create | decimal.js setup, exact string, display string | `money(decimal) -> { exact, display }` | provisional |
| `src/core/parse.ts` | create | CSV text to raw rows with source lines | `parseCsv(text)` | provisional |
| `src/core/validate.ts` | create | Raw rows to typed rows, or field errors | `validateBill(...)` | provisional |
| `src/core/compare.ts` | create | Match services and compute effects and buckets | `compareBills(before, after)` | provisional |
| `src/core/summary.ts` | create | Summary sentence, parts, display-rounding notice | `buildSummary`, `displayRoundingNotice` | provisional |
| `src/core/present.ts` | create | Comparison to the JSON contract below | `toCompareResponse(...)` | provisional |
| `src/app/api/compare/route.ts` | create | Multipart adapter. No arithmetic | `POST` | provisional |
| `tests/fixtures/<case>/` | create | Hand-calculated `before.csv`, `after.csv`, `expected.json` | one directory per case in B3 | provisional |
| `samples/before.csv`, `samples/after.csv`, `samples/invalid-before.csv` | create | Reviewer files. Headline pair plus one broken before bill | files | provisional |
| `src/core/**` | — | Must not import `next` or `react` | — | — |

### Frontend slice

| Path | Create/Modify | Responsibility | Public surface | Verified/Provisional |
|------|---------------|----------------|----------------|---------------------|
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | create | The one page and the editorial-ledger tokens | `/` | provisional |
| `src/components/upload.tsx` | create | The two bills, sample button, submit | props in, files out | provisional |
| `src/components/headline.tsx` | create | Summary, notice, three totals | response in | provisional |
| `src/components/waterfall.tsx` | create | Recharts waterfall, click selects a bucket | response in, selection out | provisional |
| `src/components/bucket-selector.tsx` | create | One control per bucket that has contributors | response in, selection out | provisional |
| `src/components/services-table.tsx` | create | Search, status, sort, expand | response in | provisional |
| `src/components/errors.tsx` | create | Errors by file and source line | `{ errors }` in | provisional |
| `src/lib/exact-order.ts` | create | Order exact decimal strings without `Number` | `compareExact(a, b)` | provisional |
| `tests/e2e/headline.spec.ts` | create | The named browser flow | Playwright | provisional |
| `Dockerfile`, `.github/workflows/ci.yml` | create | One image; typecheck, lint, test, image build, core grep | `docker build` | provisional |
| `README.md`, `docs/AI_WORKFLOW.md` | create | Reviewer docs and the AI time log | — | provisional |

### Blast radius

| Path | Why sensitive | Behavior that must stay intact |
|------|----------------|-------------------------------|
| `POST /api/compare` JSON | The only interface slice 2 consumes | The contract B4 **Produces**. A field rename is a material plan change |
| `src/core/**` | Money. A float here ships a wrong bill | Reconciliation identity. No `parseFloat`, no `Number(` |
| `prototype/` | The agreed picture of the page | Leave it. Production follows it; it does not follow production |

## The contract between the slices

`POST /api/compare` with multipart fields `before` and `after`.

Success is 200. Every money value is `{ "exact": string, "display": string }`. `exact` has no exponent and no thousands separators. `display` is `HK$` plus thousands separators and two decimals, or `-HK$…` when negative. Quantity `display` is the exact decimal text with no `HK$`.

```json
{
  "currency": "HKD",
  "totals": { "before": {}, "after": {}, "change": {} },
  "buckets": {
    "added": { "exact": "", "display": "", "contributors": 0 },
    "usage": {},
    "price": {},
    "removed": {}
  },
  "summary": "Total increased by HK$240.00: …",
  "summaryParts": [{ "type": "text", "text": "Total increased by " }, { "type": "amount", "text": "HK$240.00", "tone": "up" }],
  "displayRoundingNotice": null,
  "rows": []
}
```

`summary` is the sentence. `summaryParts` is that same sentence split so the page can underline amounts. Joining `text` yields `summary`. `tone` is `up`, `down`, or `flat`. This list is how section 8's underlined amounts happen without the browser parsing money out of prose. The section 6 example omits it; this plan adds it.

A row matches section 6: `service`, `status` (`added` | `removed` | `changed` | `unchanged`), `buckets` (only keys whose exact effect is non-zero), `before` and `after` (null on the missing side) each with `quantity`, `unitPrice`, `cost`, `sources.before` and `sources.after` (`{ fileName, line }` or null), `usageEffect`, `priceEffect`, `change`.

`displayRoundingNotice` is `null`, or:

```json
{
  "bucketsMismatch": true,
  "waterfallMismatch": true,
  "displayedBucketSum": "HK$0.00",
  "displayedStepsEnd": "HK$200.01"
}
```

Those strings are display strings. The page writes the prototype's two sentences from them and does not recompute the cents.

Errors are 400 `{ "errors": [{ "file": "before" | "after", "line": number | null, "column": string | null, "message": string }] }`. A broken reconciliation is 500 and not a rounded body.

## Workflow (for implementers)

1. **writing-plans** produced this file (type-1 decomposition).
2. Per subtask: **Plan mode** + **planning-subtasks** → a type-2 plan when **Plan mode** is `high`.
3. **Agent mode**: **test-driven-development** when `TDD suitable: yes` (or the TDD slice of `partial`). Follow **Verification** when `no`.
4. Equivalent internal changes: record and continue. A subtask split updates ids, **Consumes** / **Produces**, and **Blocked by**. A material change (this JSON, a dependency, verification): pause and confirm.

## Subtasks

Notation: `Blocked by: B2` means start after B2 is done. Subtask ids are `B*` (backend slice) and `F*` (frontend slice).

When a slice is complete, every item in **Slice acceptance (checklist)** for that slice must hold.

---

### Slice 1 — Backend

#### B1 — Scaffold and money

- [x] **Do:** Create the Next.js + TypeScript app, Vitest, and `src/core/` with no Next or React imports. Implement `money.ts`: decimal.js (precision ≥ 80), exact strings without exponent, display strings with `HK$`, thousands separators, and `ROUND_HALF_UP` to cents.

- **Consumes:** spec sections 4–5 for numeric limits and display rules. `CONTEXT.md` for naming.
- **Produces:** `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/core/money.ts`, a minimal `src/app/layout.tsx` placeholder if needed for the toolchain, and tests for display rounding (`0.005` → `HK$0.01`, `-0.005` → `-HK$0.01`).
- **Acceptance:** `npm run typecheck` passes. Money tests pass. `src/core` contains no `parseFloat` and no `Number(`.
- **Compatibility:** `prototype/` untouched.
- **Blocked by:** —
- **Plan mode:** medium — named unknown: decimal.js precision and rounding configuration for products and 10k-row sums.
- **TDD suitable:** yes
- **Verification:** `npm test` (money tests only) and `npm run typecheck`.

#### B2 — Parse and validate

- [x] **Do:** Implement `parse.ts` and `validate.ts` per spec section 4. Collect recoverable errors across both bills; fatal errors stop further validation of that file only. Enforce 1 MB and 10,000 data rows before parse.

- **Consumes:** B1 money types for parsed decimals. Spec section 4 error shape: `{ file, line, column, message }`.
- **Produces:** `parseCsv(text)`, `validateBill({ side, fileName, text })` returning `{ services, errors }`.
- **Acceptance:** One failing test per validation rule, each asserting file, line, and column. Rules covered: header trim and case-insensitivity; extra columns ignored; duplicate required header (file-level); missing header; empty file; header-only accepted (zero cost); blank service; duplicate service on the later source line; quantity and unit_price plain non-negative decimals (no symbol, separators, plus, exponent); >12 integer or >12 fractional digits; >1 MB; >10,000 data rows; unclosed quote / fatal parse (no invented cell errors); other file still validated; file-level errors use null line and column.
- **Compatibility:** none.
- **Blocked by:** B1
- **Plan mode:** high — CSV library choice and quoted newlines as one physical source line.
- **TDD suitable:** yes
- **Verification:** `npm test` (parse + validate).

#### B3 — Compare, summary, and response

- [x] **Do:** Implement `compare.ts`, `summary.ts`, and `present.ts`. Hand-write golden fixtures **before** implementation code. Add property tests (Vitest + fast-check). Map the internal comparison to the JSON contract (including `summaryParts` and `displayRoundingNotice`).

- **Consumes:** B2 validated bills. B1 money. Spec section 5 formulas and invariants.
- **Produces:** `compareBills(before, after)`, `buildSummary(...)`, `displayRoundingNotice(...)`, `toCompareResponse(...)`, and `tests/fixtures/<case>/` for every case in **Appendix A**.
- **Acceptance:** All golden fixtures match hand-calculated `expected.json`. Headline case matches section 10 numbers and summary sentence exactly. Property tests: reconciliation identity; changed-row usage + price = change; contributor = non-zero exact effect; row order invariant; swap bills negates total change. Reconciliation failure throws (becomes 500 at route). Summary grammar per **Appendix B**. `displayRoundingNotice` fields match prototype semantics.
- **Compatibility:** JSON contract in this plan unchanged.
- **Blocked by:** B2
- **Plan mode:** high — largest backend subtask; fixture set and summary part structure.
- **TDD suitable:** yes
- **Verification:** `npm test` (fixtures + property). No `parseFloat` / `Number(` in `src/core`.

#### B4 — Compare API and samples

- [x] **Do:** Thin `POST /api/compare` route: multipart `before` and `after`, call core, map errors to 400 and reconciliation failure to 500. Add `samples/before.csv`, `samples/after.csv`, `samples/invalid-before.csv`. API tests for headline success and invalid before file.

- **Consumes:** B3 `toCompareResponse` and validation errors. Contract above.
- **Produces:** `src/app/api/compare/route.ts`, the three sample files, route-level tests.
- **Acceptance:** Headline pair returns 200 with filenames and source lines on rows. Invalid sample against headline after returns 400 only: line 3 `unit_price`, line 5 duplicate `Support`; no success body. Logs may include status, row counts, duration, error category; never file contents, names, service names, quantities, prices, or costs.
- **Compatibility:** none.
- **Blocked by:** B3
- **Plan mode:** skip — adapter only if B3 handoff is complete.
- **TDD suitable:** yes
- **Verification:** `npm test` (API tests). Full `npm test` and `npm run typecheck` for slice 1.

**Slice 1 acceptance (checklist):** All of B1–B4 verification commands pass. Every **Appendix A** fixture passes. Every validation rule in B2 has a test. Property tests green. `samples/invalid-before.csv` matches B4 API test. Core grep clean.

---

### Slice 2 — Frontend

#### F1 — Shell, tokens, and page states

- [x] **Do:** shadcn/ui init, Tailwind, editorial-ledger tokens from `prototype/styles.css`, `layout.tsx`, `globals.css`, and `page.tsx` with four views (upload, pending, result, error) wired but empty of data UI.

- **Consumes:** section 8 design direction. B1 Next app (same repo).
- **Produces:** routable `/` with hidden/shown views and skip link; no compare logic yet.
- **Acceptance:** Page loads. Tokens match paper/ink/accent/red/green and font pairing. `prefers-reduced-motion` respected in CSS variables or media queries.
- **Compatibility:** `prototype/` reference only.
- **Blocked by:** B1
- **Plan mode:** medium — shadcn preset and font loading (CDN + fallback).
- **TDD suitable:** no
- **TDD suitable reason:** declarative layout and tokens; manual visual check.
- **Verification:** `npm run dev`; open `/`; no console errors.

#### F2 — Upload, samples, and pending

- [x] **Do:** `upload.tsx`: two drop zones, drag-and-drop, remove, disabled Compare until both files, `Use sample files` (fetches `samples/`*), submit calls `POST /api/compare`. Clear previous result/errors on submit. Pending ≥280ms with skeleton in table area.

- **Consumes:** B4 API. `samples/before.csv` and `samples/after.csv`.
- **Produces:** working upload → pending → result or error transition.
- **Acceptance:** Headline samples load in one click. Compare disabled until both bills. Failed compare removes prior chart entirely. Pending not a fake spinner over instant data beyond the minimum wait.
- **Compatibility:** API contract from slice 1.
- **Blocked by:** B4, F1
- **Plan mode:** skip
- **TDD suitable:** no
- **TDD suitable reason:** wiring and UX timing; covered by F6 Playwright.
- **Verification:** Manual headline upload + sample button; then F6.

#### F3 — Headline, stats, notice, reconciliation

- [x] **Do:** `headline.tsx`: render `summary` / `summaryParts` (underlined tone amounts, not interactive), `displayRoundingNotice` copy from prototype, three stat cards with conditional `Exact …` line, reconciliation block with exact values.

- **Consumes:** JSON contract. F2 result state.
- **Produces:** result header region complete except chart and table.
- **Acceptance:** Summary is largest type on page. Notice sentences match prototype when notice non-null. Stats show direction label on total change.
- **Compatibility:** no client-side money math.
- **Blocked by:** F2
- **Plan mode:** skip
- **TDD suitable:** no
- **TDD suitable reason:** presentational; strings from API.
- **Verification:** Manual with headline response; rounding fixture via dev tools or mock.

#### F4 — Waterfall and bucket selection

- [x] **Do:** `waterfall.tsx` (Recharts) and `bucket-selector.tsx`. Column layout when canvas ≥600px and labels fit; else horizontal rows. Bar/chip click selects bucket; Clear deselects. Empty buckets: flat step, no chip.

- **Consumes:** F3 result layout. Section 8 chart rules.
- **Produces:** linked selection state consumed by F5.
- **Acceptance:** Order before → added → usage → price → removed → after. Red/green with sign. Zero-total bucket with contributors remains selectable. ARIA: chart described as image with text summary of steps.
- **Compatibility:** chart may use float coordinates only.
- **Blocked by:** F3
- **Plan mode:** high — Recharts waterfall composition and label collision fallback.
- **TDD suitable:** no
- **TDD suitable reason:** visual/chart library; manual + Playwright spot checks.
- **Verification:** Manual headline + opposing demo; 390px width check.

#### F5 — Services table, exact sort, and errors

- [x] **Do:** `compareExact.ts` + tests. `services-table.tsx`: search, status segments with counts, sort via `compareExact`, bucket filter from F4, expand row with source lines and worked formulas from display strings. `errors.tsx`: grouped by file. Empty filter state with clear action. Sticky header; service column pinned on narrow screens.

- **Consumes:** F4 selection. API rows and errors shape.
- **Produces:** `src/lib/exact-order.ts`, table and error components.
- **Acceptance:** `compareExact` orders `"-20" < "0" < "0.004" < "0.01" < "10" < "240"`; `1.0` equals `1.00`. Bucket selected → contribution column, abs sort. Expand shows e.g. `(160 − 100) × HK$1.00 = HK$60.00`. Errors: line, column, message; no chart left.
- **Compatibility:** no `Number` on money fields for sort.
- **Blocked by:** F4
- **Plan mode:** skip for table; compareExact is specified.
- **TDD suitable:** partial
- **TDD suitable reason:** strict TDD on `compareExact` only; table/expand manual + F6.
- **Verification:** `npm test` (`compareExact`); manual expand Support on headline.

#### F6 — Playwright, Docker, CI, and docs

- [ ] **Do:** `tests/e2e/headline.spec.ts`, Dockerfile, `.github/workflows/ci.yml` (typecheck, lint, unit tests, e2e, docker build, core grep), `README.md`, `docs/AI_WORKFLOW.md`.

- **Consumes:** full app from F1–F5. Spec section 10 deliverables.
- **Produces:** reviewer-runnable image and docs.
- **Acceptance:** Playwright: headline samples → summary HK$240.00 → select Added → Support visible, Compute hidden → expand Support → after.csv line 4 HK$180.00 → invalid before → errors, chart gone. `docker build` && `docker run` serves app. README and AI_WORKFLOW complete per spec.
- **Compatibility:** none.
- **Blocked by:** F5
- **Plan mode:** medium — Playwright against Docker vs dev server.
- **TDD suitable:** partial
- **TDD suitable reason:** e2e test written before green run is acceptable; docs are verification-only.
- **Verification:** CI script locally; `docker build`; full **Slice 2 acceptance** below.

**Slice 2 acceptance (checklist):** F6 verification passes. Desktop and 390px headline flow: no clipped text, no console errors. Page matches editorial ledger beside `prototype/index.html`. Browser never computes or rounds money.

---

## Appendix A — Golden fixture cases (B3)

Hand-calculate `expected.json` before code. Each directory: `before.csv`, `after.csv`, `expected.json`.

| Case id | Intent |
|---------|--------|
| `headline` | Section 10 pair |
| `only-added` | Added bucket only |
| `only-removed` | Removed only |
| `usage-only` | Quantity change only |
| `price-only` | Unit price change only |
| `both-changing` | Usage and price |
| `unchanged` | Identical rows |
| `same-cost-diff-qp` | 10×2 → 5×4 |
| `tiny-unit-price` | e.g. `0.0000166667` |
| `zero-quantity` | 0×1 → 0×2, changed, no bucket contributor |
| `header-only` | Valid empty bill |
| `max-magnitude` | 12.12 digits, large sum |
| `over-limit-digits` | Rejected with line/column |
| `rounding-notice` | Two 0.004 → display HK$0.00, total 0.008 → HK$0.01 |
| `opposing-usage` | +100 and −100 usage, 2 contributors, exact 0 |
| `subcent-total-change` | Non-zero total, display HK$0.00, summary less than HK$0.01 |

## Appendix B — Summary sentence grammar (B3)

- Mention only buckets whose **exact** total is non-zero.
- Exact total change zero, no such buckets: `Total did not change.`
- Exact total change zero with moving buckets: `Total did not change: … exactly offset ….`
- Else: `Total increased by …` or `Total decreased by …`, list same-direction buckets, then `, partly offset by …` for opposites.
- Non-zero amount that displays as HK$0.00: `less than HK$0.01` anywhere in the sentence, not only on the total.
- Phrases: `from newly added services`, `from usage changes`, `from price changes`, `from removed services`.

## TDD note (Agent mode)

Backend subtasks B1–B4: strict **test-driven-development** on each slice of logic. Frontend: **F5** (`compareExact`) and **F6** (Playwright) test-first; **F1–F4** follow **Verification** manually until F6. Type-2 plans: **planning-subtasks** when **Plan mode** is `high`.

## Plan changelog

| Date | Change | Kind |
|------|--------|------|
| 2026-11-02 | Initial plan. Two slices, one contract | — |
| 2026-11-02 | Split T1/T2 into B1–B4 and F1–F6; appendices for fixtures and summary grammar | equivalent |
| 2026-11-03 | F4 chart library: hand-built SVG (matches prototype), not Recharts | equivalent |
| 2026-11-03 | F5: `exact-order.ts` + `services-view.ts`; table and grouped errors | equivalent |
