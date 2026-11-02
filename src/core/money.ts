import DecimalImport from "decimal.js";

export const Decimal = DecimalImport.clone({ precision: 80 });

const CURRENCY = "HK$";

function groupIntegerDigits(integerPart: string): string {
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDisplayAmount(rounded: DecimalImport): string {
  const negative = rounded.isNegative() && !rounded.isZero();
  const magnitude = negative ? rounded.abs() : rounded;
  const [whole, fraction = "00"] = magnitude.toFixed(2).split(".");
  const amount = `${groupIntegerDigits(whole)}.${fraction}`;
  return negative ? `-${CURRENCY}${amount}` : `${CURRENCY}${amount}`;
}

export function money(value: DecimalImport): { exact: string; display: string } {
  const exact = value.toFixed();
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const display = formatDisplayAmount(rounded);
  return { exact, display };
}
