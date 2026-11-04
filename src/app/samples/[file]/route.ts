import { readFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_SAMPLES = new Set([
  "before.csv",
  "after.csv",
  "invalid-before.csv",
  "rounding-before.csv",
  "rounding-after.csv",
  "opposing-before.csv",
  "opposing-after.csv",
]);

type RouteContext = { params: Promise<{ file: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { file } = await context.params;
  if (!ALLOWED_SAMPLES.has(file)) {
    return new Response(null, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "samples", file);
  const text = await readFile(filePath, "utf8");
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
