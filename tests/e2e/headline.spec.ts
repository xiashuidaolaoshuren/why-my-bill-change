import { expect, test, type Page } from "@playwright/test";

/**
 * One browser run over the headline sample and the invalid sample:
 * summary, Bucket selection, row detail, then the error state.
 */

/** Console errors and uncaught exceptions must stay empty for a clean run. */
function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

/**
 * Chromium logs any 4xx response as a console error. The invalid sample is
 * meant to answer 400, so that one line is allowed; everything else must be
 * clean.
 */
function expectNoProblems(problems: string[], allowed: RegExp[] = []) {
  const unexpected = problems.filter(
    (problem) => !allowed.some((pattern) => pattern.test(problem)),
  );
  expect(unexpected).toEqual([]);
}

async function loadHeadlineSample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Use sample files" }).click();
  await expect(page.locator("#view-result")).toBeVisible();
  await expect(page.locator("#summary-heading")).toContainText("HK$240.00");
}

const serviceNames = (page: Page) =>
  page.locator("#view-result .ledger tbody tr.svc-row .service-name");

test("headline sample: summary, Bucket filter, expanded row, clear", async ({
  page,
}) => {
  const problems = trackProblems(page);
  await loadHeadlineSample(page);

  // The reconciliation is stated in exact, currency-prefixed values.
  await expect(page.locator(".rec-value").first()).toHaveText("HK$170");
  await expect(page.locator(".rec-value").last()).toHaveText("HK$410");

  const removedHit = page.locator('button.wf-hit[data-bucket="removed"]');
  await removedHit.focus();
  const tooltip = page.locator(".wf-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".tt-title")).toHaveText("Removed Bucket");
  await expect(tooltip.locator(".tt-row")).toHaveCount(4);
  const tooltipText = await tooltip.innerText();
  expect(tooltipText).toContain("Displayed");
  expect(tooltipText).toContain("-HK$20.00");
  expect(tooltipText).toContain("Exact");
  expect(tooltipText).toContain("From");
  expect(tooltipText).toContain("HK$430.00");
  expect(tooltipText).toContain("To");
  expect(tooltipText).toContain("HK$410.00");
  await expect(tooltip.locator(".tt-foot")).toHaveText(
    "1 Contributor · select to filter the table",
  );

  // Default order is the largest increase first.
  await expect(serviceNames(page)).toHaveText([
    "Support",
    "Compute",
    "Storage",
    "Legacy",
  ]);

  // Selecting Added narrows the table to its one Contributor.
  await page.locator('.chip[data-bucket="added"]').click();
  await expect(page.locator('.chip[data-bucket="added"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".bucket-filter")).toContainText("1 Contributor");
  await expect(page.locator(".bucket-filter")).toContainText("HK$180.00");
  await expect(
    page.locator("#view-result .ledger thead th.col-change .sort-name"),
  ).toHaveText("Added");
  await expect(serviceNames(page)).toHaveText(["Support"]);
  await expect(page.locator("#view-result .ledger tbody")).not.toContainText(
    "Compute",
  );

  // The row expands to its Source lines and worked formula.
  await page.locator("#view-result .ledger tbody .row-toggle").click();
  const detail = page.locator("#view-result .detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("after.csv · Source line 4");
  await expect(detail).toContainText("HK$180.00");
  await expect(detail.locator(".formula code").first()).toHaveText(
    "180 × HK$1.00 = HK$180.00",
  );
  await expect(detail.locator(".formula.is-active")).toHaveCount(1);

  // Clearing the Bucket restores the full table and the default column.
  await page.locator(".bucket-filter .btn-link").click();
  await expect(page.locator(".bucket-filter")).toHaveCount(0);
  await expect(
    page.locator("#view-result .ledger thead th.col-change .sort-name"),
  ).toHaveText("Total change");
  await expect(serviceNames(page)).toHaveText([
    "Support",
    "Compute",
    "Storage",
    "Legacy",
  ]);

  expectNoProblems(problems);
});

test("invalid sample: grouped errors and no chart", async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Invalid/ }).click();

  await expect(page.locator("#view-error")).toBeVisible();
  await expect(page.locator("#error-title")).toHaveText(
    "2 problems stop this Comparison",
  );
  await expect(page.locator("#view-error .lede")).toContainText(
    "Fix invalid-before.csv, then compare again.",
  );

  const groups = page.locator(".error-group");
  await expect(groups).toHaveCount(2);
  await expect(page.locator(".error-group-title")).toHaveText([
    "Before bill",
    "After bill",
  ]);
  await expect(groups.first()).toContainText("invalid-before.csv");
  await expect(groups.first()).toContainText("2 problems");
  await expect(groups.last()).toContainText("No problems found");

  const errorRows = groups.first().locator(".error-table tbody tr");
  await expect(errorRows).toHaveCount(2);
  await expect(errorRows.first().locator(".err-line")).toHaveText("3");
  await expect(errorRows.first().locator(".err-col code")).toHaveText(
    "unit_price",
  );
  await expect(errorRows.last().locator(".err-line")).toHaveText("5");
  await expect(errorRows.last().locator(".err-msg")).toContainText(
    "Duplicate Service",
  );

  // The previous Comparison is gone, not merely hidden.
  await expect(page.locator("#view-result .waterfall")).toHaveCount(0);
  await expect(page.locator("#view-result .table-wrap")).toHaveCount(0);
  await expect(page.locator("#view-result")).toBeHidden();

  expectNoProblems(problems, [/status of 400 \(Bad Request\)/]);
});

test.describe("390px viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("headline flow fits without horizontal page overflow", async ({
    page,
  }) => {
    const problems = trackProblems(page);
    await loadHeadlineSample(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.locator('.chip[data-bucket="added"]').click();
    await expect(page.locator(".bucket-filter")).toBeVisible();
    await page.locator("#view-result .ledger tbody .row-toggle").click();
    await expect(page.locator("#view-result .detail")).toBeVisible();

    const overflowAfter = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowAfter).toBeLessThanOrEqual(1);

    expectNoProblems(problems);
  });
});
