import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // The stylesheet lives in the App Router root layout, shared by every
      // page, with a system fallback in globals.css. The rule targets the
      // Pages Router's _document.js.
      "@next/next/no-page-custom-font": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // The static prototype is a visual reference, not shipped code.
    "prototype/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
