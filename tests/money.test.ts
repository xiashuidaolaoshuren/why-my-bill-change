import { describe, expect, it } from "vitest";
import { Decimal, money } from "../src/core/money";

describe("money display rounding (half up to cents)", () => {
  it("rounds 0.005 to HK$0.01 with exact 0.005", () => {
    const result = money(new Decimal("0.005"));
    expect(result.exact).toBe("0.005");
    expect(result.display).toBe("HK$0.01");
  });

  it("rounds -0.005 to -HK$0.01", () => {
    const result = money(new Decimal("-0.005"));
    expect(result.exact).toBe("-0.005");
    expect(result.display).toBe("-HK$0.01");
  });

  it("rounds -0.004 to HK$0.00 with exact -0.004", () => {
    const result = money(new Decimal("-0.004"));
    expect(result.exact).toBe("-0.004");
    expect(result.display).toBe("HK$0.00");
  });

  it("formats 180 as HK$180.00 with exact 180", () => {
    const result = money(new Decimal("180"));
    expect(result.exact).toBe("180");
    expect(result.display).toBe("HK$180.00");
  });

  it("uses plain notation for exact strings without exponent", () => {
    expect(money(new Decimal("0.0000001")).exact).toBe("0.0000001");
    const twentyTwoDigitInteger = "1" + "0".repeat(21);
    expect(money(new Decimal(twentyTwoDigitInteger)).exact).toBe(
      twentyTwoDigitInteger,
    );
    expect(money(new Decimal("0.0000001")).exact).not.toMatch(/e/i);
    expect(money(new Decimal(twentyTwoDigitInteger)).exact).not.toMatch(/e/i);
  });

  it("displays signed zero as HK$0.00", () => {
    const negativeZero = new Decimal("0").negated();
    expect(negativeZero.isZero()).toBe(true);
    expect(negativeZero.isNegative()).toBe(true);
    expect(money(negativeZero).display).toBe("HK$0.00");
  });
});

describe("money display grouping", () => {
  it("groups thousands in display strings", () => {
    expect(money(new Decimal("-1234.5")).display).toBe("-HK$1,234.50");
    expect(money(new Decimal("1000.005")).display).toBe("HK$1,000.01");
  });
});

describe("Decimal precision for bill arithmetic", () => {
  it("squares a 12-digit integer exactly", () => {
    const square = new Decimal("999999999999").times("999999999999");
    expect(square.toFixed()).toBe("999999999998000000000001");
  });

  it("sums 10,000 max integer squares exactly", () => {
    const term = new Decimal("999999999999").times("999999999999");
    let sum = new Decimal("0");
    for (let i = 0; i < 10_000; i += 1) {
      sum = sum.plus(term);
    }
    expect(sum.toFixed()).toBe("9999999999980000000000010000");
  });

  it("squares 1.000000000001 exactly", () => {
    const square = new Decimal("1.000000000001").times("1.000000000001");
    expect(square.toFixed()).toBe("1.000000000002000000000001");
  });

  it("squares a 12.12-digit value exactly", () => {
    const value = "999999999999.999999999999";
    const reference = Decimal.clone({ precision: 100 });
    const expected = new reference(value).times(value).toFixed();
    expect(new Decimal(value).times(value).toFixed()).toBe(expected);
  });

  it("sums 10,000 twelve-digit squares exactly", () => {
    const value = "999999999999.999999999999";
    const reference = Decimal.clone({ precision: 100 });
    const product = new reference(value).times(value);
    let expectedSum = new reference("0");
    for (let i = 0; i < 10_000; i += 1) {
      expectedSum = expectedSum.plus(product);
    }

    const term = new Decimal(value).times(value);
    let sum = new Decimal("0");
    for (let i = 0; i < 10_000; i += 1) {
      sum = sum.plus(term);
    }
    expect(sum.toFixed()).toBe(expectedSum.toFixed());
  });
});
