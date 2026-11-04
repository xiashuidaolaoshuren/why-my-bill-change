import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleCompare, POST } from "../src/app/api/compare/route";

const root = join(import.meta.dirname, "..");
const readSample = (name: string) =>
  readFileSync(join(root, "samples", name), "utf8");
const readFixture = (name: string) =>
  readFileSync(join(root, "tests", "fixtures", "headline", name), "utf8");

const LOG_KEYS = [
  "outcome",
  "status",
  "beforeRows",
  "afterRows",
  "durationMs",
  "errorCategory",
] as const;

const LEAK_MARKERS = [
  "before.csv",
  "after.csv",
  "invalid-before.csv",
  "Compute",
  "Support",
  "oops",
  "HK$",
];

function expectSafeLog(info: ReturnType<typeof vi.spyOn>): void {
  expect(info).toHaveBeenCalledTimes(1);
  const payload = info.mock.calls[0][0] as Record<string, unknown>;
  expect(Object.keys(payload).sort()).toEqual([...LOG_KEYS].sort());
  const serialized = JSON.stringify(payload);
  for (const marker of LEAK_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
}

function compareRequest(before: File, after: File): Request {
  const form = new FormData();
  form.set("before", before);
  form.set("after", after);
  return new Request("http://localhost/api/compare", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/compare", () => {
  it("returns 200 and the headline compare contract for sample files", async () => {
    const before = new File([readSample("before.csv")], "before.csv", {
      type: "text/csv",
    });
    const after = new File([readSample("after.csv")], "after.csv", {
      type: "text/csv",
    });
    const expected = JSON.parse(readFixture("expected.json"));

    const response = await POST(compareRequest(before, after));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  });

  it("returns 400 for invalid before sample without a compare body", async () => {
    const before = new File([readSample("invalid-before.csv")], "invalid-before.csv", {
      type: "text/csv",
    });
    const after = new File([readSample("after.csv")], "after.csv", {
      type: "text/csv",
    });

    const response = await POST(compareRequest(before, after));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toEqual([
      {
        file: "before",
        line: 3,
        column: "unit_price",
        message: expect.any(String),
        source: "Storage,50,oops",
      },
      {
        file: "before",
        line: 5,
        column: "service",
        message: expect.any(String),
        source: "Support,12,1",
      },
    ]);
    expect(body).not.toHaveProperty("totals");
    expect(body).not.toHaveProperty("rows");
    expect(body).not.toHaveProperty("summary");
  });

  it("returns 400 for invalid UTF-8 on one bill and still validates the other", async () => {
    const before = new File([new Uint8Array([0xff, 0xfe])], "bad.csv", {
      type: "text/csv",
    });
    const after = new File(
      ["service,quantity,unit_price\nBad,1,oops\n"],
      "after.csv",
      { type: "text/csv" },
    );

    const response = await POST(compareRequest(before, after));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        {
          file: "before",
          line: null,
          column: null,
          message: expect.stringContaining("UTF-8"),
          source: null,
        },
        {
          file: "after",
          line: 2,
          column: "unit_price",
          message: expect.any(String),
          source: "Bad,1,oops",
        },
      ]),
    );
    expect(body.errors).toHaveLength(2);
  });

  it("validates both sides when before is missing", async () => {
    const form = new FormData();
    form.set(
      "after",
      new File(
        ["service,quantity,unit_price\nBad,1,oops\n"],
        "after.csv",
        { type: "text/csv" },
      ),
    );
    const response = await POST(
      new Request("http://localhost/api/compare", { method: "POST", body: form }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        {
          file: "before",
          line: null,
          column: null,
          message: "Upload a CSV file for this bill.",
          source: null,
        },
        {
          file: "after",
          line: 2,
          column: "unit_price",
          message: expect.any(String),
          source: "Bad,1,oops",
        },
      ]),
    );
    expect(body.errors).toHaveLength(2);
  });

  it("returns 500 reconciliation without money fields when compare throws", async () => {
    const before = new File([readSample("before.csv")], "before.csv", {
      type: "text/csv",
    });
    const after = new File([readSample("after.csv")], "after.csv", {
      type: "text/csv",
    });
    const response = await handleCompare(
      compareRequest(before, after),
      () => {
        throw new Error("Reconciliation failed");
      },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "reconciliation" });
    expect(body).not.toHaveProperty("totals");
    expect(body).not.toHaveProperty("rows");
  });
});

describe("compare route logging", () => {
  it("logs only safe fields on success and validation failure", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const before = new File([readSample("before.csv")], "before.csv", {
      type: "text/csv",
    });
    const after = new File([readSample("after.csv")], "after.csv", {
      type: "text/csv",
    });
    await POST(compareRequest(before, after));
    expectSafeLog(info);
    expect(info.mock.calls[0][0]).toMatchObject({
      outcome: "ok",
      status: 200,
      beforeRows: 3,
      afterRows: 3,
      errorCategory: null,
    });

    info.mockClear();
    const invalidBefore = new File([readSample("invalid-before.csv")], "invalid-before.csv", {
      type: "text/csv",
    });
    await POST(compareRequest(invalidBefore, after));
    expectSafeLog(info);
    expect(info.mock.calls[0][0]).toMatchObject({
      outcome: "validation",
      status: 400,
      beforeRows: 2,
      afterRows: 3,
      errorCategory: "validation",
    });

    info.mockRestore();
  });
});
