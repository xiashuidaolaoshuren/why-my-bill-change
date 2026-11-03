type ParsedExact = {
  negative: boolean;
  int: string;
  frac: string;
};

function parseExact(raw: string): ParsedExact {
  let text = raw.trim();
  if (text.startsWith("+")) text = text.slice(1).trim();

  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1).trim();
  }

  const dot = text.indexOf(".");
  let intPart = dot === -1 ? text : text.slice(0, dot);
  let fracPart = dot === -1 ? "" : text.slice(dot + 1);

  intPart = intPart.replace(/^0+(?=\d)/, "") || "0";
  fracPart = fracPart.replace(/0+$/, "");

  if (intPart === "0" && fracPart === "") negative = false;

  return { negative, int: intPart, frac: fracPart };
}

function compareMagnitude(a: ParsedExact, b: ParsedExact): number {
  if (a.int.length !== b.int.length) {
    return a.int.length < b.int.length ? -1 : 1;
  }
  const intOrder = a.int.localeCompare(b.int);
  if (intOrder !== 0) return intOrder;

  const maxFrac = Math.max(a.frac.length, b.frac.length);
  const fracA = a.frac.padEnd(maxFrac, "0");
  const fracB = b.frac.padEnd(maxFrac, "0");
  return fracA.localeCompare(fracB);
}

/** Order exact decimal strings without using Number or parseFloat. */
export function compareExact(a: string, b: string): number {
  const left = parseExact(a);
  const right = parseExact(b);

  if (left.negative !== right.negative) {
    return left.negative ? -1 : 1;
  }

  const magnitude = compareMagnitude(left, right);
  if (magnitude === 0) return 0;
  return left.negative ? -magnitude : magnitude;
}

function formatExact(parsed: ParsedExact): string {
  if (parsed.int === "0" && parsed.frac === "") return "0";
  return parsed.frac ? `${parsed.int}.${parsed.frac}` : parsed.int;
}

export function absExact(raw: string): string {
  const parsed = parseExact(raw);
  return formatExact({ negative: false, int: parsed.int, frac: parsed.frac });
}

export function compareExactMagnitude(a: string, b: string): number {
  return compareExact(absExact(a), absExact(b));
}
