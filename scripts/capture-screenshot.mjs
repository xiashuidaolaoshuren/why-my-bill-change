/**
 * Regenerates docs/screenshot.png from a production server.
 *
 *   npx next start -p 3100
 *   node scripts/capture-screenshot.mjs
 */
import { chromium } from "@playwright/test";

const BASE_URL = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:3100";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 2,
});

await page.goto(BASE_URL);
await page.getByRole("button", { name: "Use sample files" }).click();
await page.locator("#summary-heading").waitFor();
await page.locator('.chip[data-bucket="added"]').click();
await page.locator("#view-result .ledger tbody .row-toggle").click();
await page.locator("#view-result .detail").waitFor();

await page.screenshot({ path: "docs/screenshot.png", fullPage: true });
await browser.close();
console.log("Wrote docs/screenshot.png");
