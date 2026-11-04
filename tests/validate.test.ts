import { describe, expect, it, vi } from "vitest";
import { Decimal } from "../src/core/money";
import * as parseModule from "../src/core/parse";
import { decodeBillText, validateBill } from "../src/core/validate";

const beforeBill = {
  side: "before" as const,
  fileName: "before.csv",
};

describe("decodeBillText", () => {
  it("rejects bytes that are not valid UTF-8", () => {
    expect(decodeBillText(new Uint8Array([0xff, 0xfe, 0x41]))).toEqual({
      ok: false,
    });
  });

  it("decodes valid UTF-8 text", () => {
    const bytes = new TextEncoder().encode("service,quantity,unit_price\n");
    expect(decodeBillText(bytes)).toEqual({ ok: true, text: "service,quantity,unit_price\n" });
  });
});

describe("validateBill happy path", () => {
  it("accepts trimmed mixed-case headers, ignores extra columns, and header-only files", () => {
    const headerOnly = validateBill({
      ...beforeBill,
      text: " SERVICE ,Quantity,UNIT_PRICE\n",
    });
    expect(headerOnly.errors).toEqual([]);
    expect(headerOnly.services).toEqual([]);

    const withRow = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price,ignored\nCompute,100,0.10,extra",
    });
    expect(withRow.errors).toEqual([]);
    expect(withRow.services).toHaveLength(1);
    expect(withRow.services[0].service).toBe("Compute");
    expect(withRow.services[0].quantity.equals(new Decimal("100"))).toBe(true);
    expect(withRow.services[0].unitPrice.equals(new Decimal("0.10"))).toBe(
      true,
    );
    expect(withRow.services[0].source).toEqual({
      fileName: "before.csv",
      line: 2,
    });
    expect(withRow.services[0]).not.toHaveProperty("cost");
  });

  it("uses the parse start line when a service name spans a quoted newline", () => {
    const text = `service,quantity,unit_price
"line1
line2",5,2`;
    const result = validateBill({ ...beforeBill, text });
    expect(result.errors).toEqual([]);
    expect(result.services[0].service).toBe("line1\nline2");
    expect(result.services[0].source.line).toBe(2);
  });
});

describe("validateBill file-level header errors", () => {
  it("rejects a duplicate required header without keeping data rows", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price,quantity\nCompute,1,1,2",
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: "before",
        line: null,
        column: null,
        message: expect.stringContaining("quantity"),
        source: null,
      },
    ]);
  });

  it("rejects a missing required header as a file-level error", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity\nCompute,1",
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: "before",
        line: null,
        column: null,
        message: expect.stringContaining("unit_price"),
        source: null,
      },
    ]);
  });
});

describe("validateBill empty file", () => {
  it("rejects an empty file before parsing", () => {
    const result = validateBill({ ...beforeBill, text: "" });
    expect(result.services).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBeNull();
    expect(result.errors[0].column).toBeNull();
  });

  it("rejects a whitespace-only file before parsing", () => {
    const spy = vi.spyOn(parseModule, "parseCsv");
    const result = validateBill({ ...beforeBill, text: "  \n\t" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(result.services).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBeNull();
  });
});

describe("validateBill cell errors", () => {
  it("rejects a blank service name on that source line", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\n ,1,1",
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: "before",
        line: 2,
        column: "service",
        message: expect.any(String),
        source: " ,1,1",
      },
    ]);
  });

  it("reports all blank cells on a comma-only data row", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\n,,",
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 2, column: "service" }),
        expect.objectContaining({ line: 2, column: "quantity" }),
        expect.objectContaining({ line: 2, column: "unit_price" }),
      ]),
    );
    expect(result.errors).toHaveLength(3);
  });

  it("reports a duplicate even when the first row failed another cell", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\nCompute,nope,1\nCompute,2,2",
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 2, column: "quantity" }),
        expect.objectContaining({ line: 3, column: "service" }),
      ]),
    );
    expect(result.errors).toHaveLength(2);
  });

  it("keeps the first service and errors on the later duplicate line", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\nSupport,1,1\nSupport,2,2\nsupport,3,3",
    });
    expect(result.services).toHaveLength(2);
    expect(result.services.map((s) => s.service)).toEqual(["Support", "support"]);
    expect(result.errors).toEqual([
      {
        file: "before",
        line: 3,
        column: "service",
        message: expect.stringContaining("Support"),
        source: "Support,2,2",
      },
    ]);
  });

  it.each([
    ["HK$1", "quantity", "Bad,HK$1,1"],
    ["1,000", "quantity", 'Bad,"1,000",1'],
    ["+1", "unit_price", "Bad,1,+1"],
    ["1e2", "unit_price", "Bad,1,1e2"],
    ["1000000000000", "quantity", "Bad,1000000000000,1"],
    ["0.0000000000001", "unit_price", "Bad,1,0.0000000000001"],
  ])("rejects invalid decimal %s on column %s", (_value, column, row) => {
    const result = validateBill({
      ...beforeBill,
      text: `service,quantity,unit_price\n${row}`,
    });
    expect(result.services).toEqual([]);
    expect(result.errors.some((e) => e.column === column && e.line === 2)).toBe(
      true,
    );
  });

  it("reports every invalid cell on the same row", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\nBad,HK$1,1e2",
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 2, column: "quantity" }),
        expect.objectContaining({ line: 2, column: "unit_price" }),
      ]),
    );
    expect(result.errors).toHaveLength(2);
  });

  it("treats a missing quantity cell as empty", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\nBad,,1",
    });
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 2, column: "quantity" }),
    ]);
  });

  it("carries the raw source line on cell errors", () => {
    const result = validateBill({
      ...beforeBill,
      text: "service,quantity,unit_price\nStorage,50,oops",
    });
    expect(result.errors).toEqual([
      expect.objectContaining({
        line: 2,
        column: "unit_price",
        source: "Storage,50,oops",
      }),
    ]);
  });
});

describe("validateBill size limits", () => {
  it("rejects a file larger than 1 MiB before parsing", () => {
    const spy = vi.spyOn(parseModule, "parseCsv");
    const text = `service,quantity,unit_price\n${"x".repeat(1024 * 1024)}`;
    expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(1024 * 1024);
    const result = validateBill({ ...beforeBill, text });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(result.services).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBeNull();
  });

  it("accepts a file whose UTF-8 size is exactly 1 MiB", () => {
    const header = "service,quantity,unit_price\n";
    const target = 1024 * 1024;
    let serviceLength = target - Buffer.byteLength(`${header},1,1\n`, "utf8");
    let text = `${header}${"a".repeat(serviceLength)},1,1\n`;
    while (Buffer.byteLength(text, "utf8") > target) {
      serviceLength -= 1;
      text = `${header}${"a".repeat(serviceLength)},1,1\n`;
    }
    while (Buffer.byteLength(text, "utf8") < target) {
      serviceLength += 1;
      text = `${header}${"a".repeat(serviceLength)},1,1\n`;
    }
    expect(Buffer.byteLength(text, "utf8")).toBe(target);
    const result = validateBill({ ...beforeBill, text });
    expect(result.errors).toEqual([]);
    expect(result.services).toHaveLength(1);
  });

  it("rejects more than 10,000 data rows as a file-level error", () => {
    const rows = Array.from(
      { length: 10_001 },
      (_, index) => `S${index},1,1`,
    ).join("\n");
    const result = validateBill({
      ...beforeBill,
      text: `service,quantity,unit_price\n${rows}`,
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBeNull();
    expect(result.errors[0].column).toBeNull();
  });

  it("accepts exactly 10,000 data rows", () => {
    const rows = Array.from(
      { length: 10_000 },
      (_, index) => `S${index},1,1`,
    ).join("\n");
    const result = validateBill({
      ...beforeBill,
      text: `service,quantity,unit_price\n${rows}`,
    });
    expect(result.errors).toEqual([]);
    expect(result.services).toHaveLength(10_000);
  });
});

describe("validateBill fatal parse", () => {
  it("returns one file-level error for an invalid closing quote", () => {
    const result = validateBill({
      ...beforeBill,
      text: `service,quantity,unit_price
"Compute"x,1,1`,
    });
    expect(result.services).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: "before",
        line: null,
        column: null,
        message: expect.any(String),
        source: null,
      },
    ]);
  });

  it("returns one file-level error and does not block validating another bill", () => {
    const broken = validateBill({
      side: "before",
      fileName: "broken.csv",
      text: `service,quantity,unit_price
"unclosed,1,1
good,2,2`,
    });
    expect(broken.services).toEqual([]);
    expect(broken.errors).toEqual([
      {
        file: "before",
        line: null,
        column: null,
        message: expect.any(String),
        source: null,
      },
    ]);

    const good = validateBill({
      side: "after",
      fileName: "after.csv",
      text: "service,quantity,unit_price\nCompute,1,1",
    });
    expect(good.errors).toEqual([]);
    expect(good.services).toHaveLength(1);
  });
});
