/**
 * Money is never computed in the browser, and never with floating point on the
 * server. This guard fails the build if `Number(` or `parseFloat` appears in the
 * calculation or ordering modules.
 *
 * Chart geometry in `src/components` is the only place allowed to touch Number.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  "src/core",
  "src/lib/exact-order.ts",
  "src/lib/services-view.ts",
  "src/lib/display.ts",
];
const FORBIDDEN = [/\bparseFloat\s*\(/, /\bNumber\s*\(/];
const EXTENSIONS = new Set([".ts", ".tsx"]);

async function collect(target) {
  const full = path.join(ROOT, target);
  try {
    const entries = await readdir(full, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const child = path.join(target, entry.name);
      if (entry.isDirectory()) files.push(...(await collect(child)));
      else if (EXTENSIONS.has(path.extname(entry.name))) files.push(child);
    }
    return files;
  } catch (error) {
    if (error.code === "ENOTDIR") return [target];
    throw error;
  }
}

const files = (await Promise.all(TARGETS.map(collect))).flat();
const offenders = [];

for (const file of files) {
  const lines = (await readFile(path.join(ROOT, file), "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(line)) {
        offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    }
  });
}

if (offenders.length > 0) {
  console.error("Money code must not use floating point:");
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(`check:core passed (${files.length} files scanned).`);
