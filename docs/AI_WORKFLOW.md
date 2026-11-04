# AI workflow

How this project was directed and verified with AI assistance. The goal was not
to accept generated code, but to constrain it: hand-calculated answers first,
tests that fail before the implementation, and a browser check for anything the
tests cannot see.

## Tools

| Tool | Used for |
|---|---|
| Cursor, Plan mode | Decompose the work into a written plan (`docs/superpowers/plans/2026-10-31-bill-change-explorer-plan.md`) and a per-task plan before touching code |
| Cursor, Agent mode | Implement one task at a time against that plan |
| Vitest + `fast-check` | Golden fixtures, property tests, validation, API route, sort and ordering units |
| Playwright | One browser run over the headline and error flows, desktop and 390px |
| Browser automation (CDP) | Inspect layout, element geometry, ARIA state, and computed styles during development |
| Docker, GitHub Actions | Ship and re-verify the same image the reviewer runs |

## Key steps

| Commit | Slice | What it established |
|---|---|---|
| `98a15e6`, `a7c2822`, `9a427f0`, `44d4265` | Scope and reference | Domain terms in `CONTEXT.md`, reviewed design spec, OpenDesign prototype used as the visual reference, two-slice plan |
| `657765d` | B1 | Next.js scaffold and the HKD money module |
| `4937511` | B2 | CSV parsing and bill validation, one test per rule |
| `fca6455` | B3 | Comparison, summary sentence, JSON response, property tests |
| `6a47672` | B4 | `POST /api/compare` and reviewer samples |
| `972b928` | F1 | Editorial shell, tokens, and the four page states |
| `f1d4dd4` | F2 | Upload, samples, and the compare flow |
| `4eb0a02` | F3 | Headline, stats, rounding notice, reconciliation |
| `79bd555` | F4 | Hand-built SVG waterfall and Bucket selection |
| `664a8c8` | F5 | Exact decimal order, Services table, grouped errors |
| F6 | Delivery | Playwright, ESLint plus a core grep, Dockerfile, CI, README, this document |

Two decisions changed from the original plan and are recorded in the plan
changelog: the waterfall is hand-built SVG rather than Recharts, and the table
sorts with an exact string comparator (`src/lib/exact-order.ts`) rather than
converting to `Number`.

## Time log

Approximate, from commit timestamps; days are 4-6 focused hours.

| Day | Work | Estimate |
|---|---|---|
| 2026-10-31 | Scope, domain terms, design spec, static prototype | 5h |
| 2026-11-02, early | Plan, B1-B4 (money, parse, validate, compare, summary, API, fixtures) | 5h |
| 2026-11-02, late | F1-F6 (shell, upload, headline, chart, table, e2e, Docker, CI, docs) | 6h |
| 2026-11-04 | Code review fixes: csv-parse and UTF-8 validation, row validation, client/core boundary | 1h |

## AI mistakes, and the test that caught each

Every item below was found by a check that is still in the repository, not by
re-reading the code.

1. **Chart step key passed where a Bucket key was expected (F4).** The waterfall
   mapped over steps whose key type also includes `before` and `after`. Passing
   that key to a bucket-selection callback is a type error. Caught by
   `npm run typecheck` (TS2345); the fix casts only on the branch that renders a
   selectable Bucket step.
2. **Tests could not resolve `@/` (F5).** The first `tests/services-view.test.ts`
   run failed with `Cannot find package '@/lib/exact-order'`, because the Vitest
   config had no path alias. Caught by `npm test`; fixed by adding the alias to
   `vitest.config.ts` so tests resolve imports exactly as the app does.
3. **Rows with a missing Cost sorted first when descending (F5).** Sorting by
   `Before Cost` descending put added Services at the top, because a null side
   was treated as a value and then inverted by the direction. Caught by
   `tests/services-view.test.ts` ("sorts missing costs last regardless of
   direction"); null handling now runs before the direction is applied.
4. **Exact comparison edge cases (F5).** `"1.0"` vs `"1.00"`, `"-0"` vs `"0"`,
   leading `+` and leading zeros, and 12-digit magnitudes all had to compare
   without floating point. Written first in `tests/exact-order.test.ts`, which
   failed against the missing module and then drove `src/lib/exact-order.ts`.
5. **A screen-reader label widened the page on a phone (F6).** The "Not in this
   bill" span uses `.sr-only`, which is absolutely positioned. With no
   positioned ancestor inside the table, it escaped the table's scroll area and
   made the document 569px wide at a 390px viewport. Caught by the Playwright
   overflow assertion in `tests/e2e/headline.spec.ts`; fixed with
   `.ledger td { position: relative; }` in `src/app/globals.css`.
6. **Ambiguous e2e locators (F6).** `.ledger tbody` matched both the hidden
   loading skeleton and the result table, which Playwright reports as a strict
   mode violation. Caught by the Playwright run itself; locators are now scoped
   to `#view-result`.
7. **Console assertion was too strict (F6).** Chromium logs the deliberately
   invalid sample's 400 response as a console error, so the clean-console check
   failed on a correct app. Caught by the e2e run; the invalid-sample test now
   allows exactly that one line and still fails on any other console error or
   uncaught exception.
8. **PowerShell shell mistakes.** Combining `&&` with heredocs in the commit
   step failed, and only the shell caught it. Commit messages are now written
   with plain sequential commands.
9. **Only unclosed-quote CSV errors became a 400 (review).** Other csv-parse
   failures such as `"Compute"x,1,1` were rethrown and could escape validation.
   Caught by `tests/parse.test.ts` ("returns ok false on an invalid closing
   quote") and `tests/validate.test.ts` ("returns one file-level error for an
   invalid closing quote"); `parseCsv` now maps any csv-parse error code to
   `{ ok: false }`.
10. **Invalid UTF-8 was accepted via `File.text()` (review).** Replacement
    characters let a corrupted service name through as a successful compare.
    Caught by `tests/validate.test.ts` ("rejects bytes that are not valid
    UTF-8") and `tests/api-compare.test.ts` ("returns 400 for invalid UTF-8 on
    one bill and still validates the other"); the route now decodes with fatal
    UTF-8 before validation.
11. **Blank comma-only rows were dropped; duplicates after a bad row were missed
    (review).** Caught by `tests/validate.test.ts` ("reports all blank cells on
    a comma-only data row" and "reports a duplicate even when the first row
    failed another cell").
12. **Client components imported `BUCKET_KEYS` from `compare.ts` (review).**
    That module pulls in decimal.js. Fixed by `src/core/contract.ts` and
    `src/lib/display.ts`; verified with `npm run typecheck` and the existing
    Playwright headline flow.

## What the verification is worth

- 107 unit, fixture, property, validation, and API tests (`npm test`).
- Three Playwright tests covering the demo path named in the design spec:
  HK$240.00 summary, Added Bucket narrows the table to Support, its worked
  formula and source line, then the invalid sample with grouped errors and no
  chart left behind, plus a 390px run that asserts no horizontal page overflow.
- `npm run check:core` rejects `Number(` and `parseFloat` in the calculation and
  ordering modules, so the "no floating-point money" rule is enforced rather
  than remembered.
- The Docker image is built and smoke-tested in CI: page, sample CSV, and one
  `POST /api/compare` returning HK$240.00.
