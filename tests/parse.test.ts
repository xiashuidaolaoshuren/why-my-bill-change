import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/core/parse";

describe("parseCsv quoted records", () => {
  it("treats a quoted newline as one record starting on the opening line", () => {
    const text = `service,quantity,unit_price
"line1
line2",10,1`;

    const result = parseCsv(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records).toHaveLength(2);
    expect(result.records[0].fields).toEqual([
      "service",
      "quantity",
      "unit_price",
    ]);
    expect(result.records[1].line).toBe(2);
    expect(result.records[1].fields[0]).toBe("line1\nline2");
    expect(result.records[1].source).toBe('"line1\nline2",10,1');
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const text = `service,quantity,unit_price
"say ""hi""",2,3`;

    const result = parseCsv(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records[1].fields[0]).toBe('say "hi"');
  });
});

describe("parseCsv fatal structure", () => {
  it("returns ok false on an unclosed quote without following rows", () => {
    const text = `service,quantity,unit_price
"unclosed,1,1
good,2,2`;

    const result = parseCsv(text);
    expect(result).toEqual({ ok: false });
  });

  it("returns ok false on an invalid closing quote", () => {
    const text = `service,quantity,unit_price
"Compute"x,1,1`;

    const result = parseCsv(text);
    expect(result).toEqual({ ok: false });
  });
});
