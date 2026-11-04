import { Decimal } from "./money";
import { parseCsv } from "./parse";

export type BillSide = "before" | "after";

type DecimalInstance = InstanceType<typeof Decimal>;

export type ValidationError = {
  file: BillSide;
  line: number | null;
  column: string | null;
  message: string;
};

export type ValidatedService = {
  service: string;
  quantity: DecimalInstance;
  unitPrice: DecimalInstance;
  source: { fileName: string; line: number };
};

const REQUIRED_COLUMNS = ["service", "quantity", "unit_price"] as const;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DATA_ROWS = 10_000;
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export function fileError(
  file: BillSide,
  message: string,
): ValidationError {
  return { file, line: null, column: null, message };
}

export function decodeBillText(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false } {
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false };
  }
}

function cellError(
  file: BillSide,
  line: number,
  column: RequiredColumn,
  message: string,
): ValidationError {
  return { file, line, column, message };
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function validateDecimalText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "The value is empty. Enter a plain decimal such as 12 or 1.40.";
  }
  if (!PLAIN_DECIMAL.test(trimmed)) {
    return `"${trimmed}" is not a plain decimal. Use digits with an optional decimal point, such as 1.40.`;
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return `"${trimmed}" is not a plain decimal. Use digits with an optional decimal point, such as 1.40.`;
  }
  const integerDigits = match[1];
  const fractionDigits = match[2] ?? "";
  if (integerDigits.replace(/^0+/, "").length > 12) {
    return `"${trimmed}" has more than 12 digits before the decimal point.`;
  }
  if (fractionDigits.length > 12) {
    return `"${trimmed}" has more than 12 digits after the decimal point.`;
  }
  return null;
}

function resolveHeader(
  file: BillSide,
  headerFields: string[],
): { columnIndex: Record<RequiredColumn, number> } | { error: ValidationError } {
  const headerNames = headerFields.map((name) => name.trim().toLowerCase());
  const columnIndex = {} as Record<RequiredColumn, number>;

  for (const column of REQUIRED_COLUMNS) {
    const positions = headerNames.flatMap((name, index) =>
      name === column ? [index] : [],
    );
    if (positions.length === 0) {
      return {
        error: fileError(
          file,
          `The header has no "${column}" column. Expected service,quantity,unit_price; extra columns are ignored.`,
        ),
      };
    }
    if (positions.length > 1) {
      return {
        error: fileError(
          file,
          `The header lists "${column}" ${positions.length} times. Keep exactly one.`,
        ),
      };
    }
    columnIndex[column] = positions[0];
  }

  return { columnIndex };
}

function fieldAt(fields: string[], index: number): string {
  return fields[index] ?? "";
}

export function validateBill({
  side,
  fileName,
  text,
}: {
  side: BillSide;
  fileName: string;
  text: string;
}): { services: ValidatedService[]; errors: ValidationError[] } {
  const body = stripBom(text);

  if (body.trim() === "") {
    return {
      services: [],
      errors: [
        fileError(
          side,
          'The file is empty. Expected the header "service,quantity,unit_price" and one row per Service.',
        ),
      ],
    };
  }

  if (Buffer.byteLength(body, "utf8") > MAX_FILE_BYTES) {
    return {
      services: [],
      errors: [
        fileError(
          side,
          "The file is over 1 MB. Each bill file must be 1 MB or smaller.",
        ),
      ],
    };
  }

  const parsed = parseCsv(body);
  if (!parsed.ok) {
    return {
      services: [],
      errors: [
        fileError(
          side,
          "The CSV could not be parsed. Check for an unclosed quote or other structural problem.",
        ),
      ],
    };
  }

  if (parsed.records.length === 0) {
    return {
      services: [],
      errors: [
        fileError(
          side,
          'The file is empty. Expected the header "service,quantity,unit_price" and one row per Service.',
        ),
      ],
    };
  }

  const header = resolveHeader(side, parsed.records[0].fields);
  if ("error" in header) {
    return { services: [], errors: [header.error] };
  }

  const { columnIndex } = header;
  const minimumFields =
    Math.max(...Object.values(columnIndex)) + 1;

  const dataRecords = parsed.records.slice(1);

  if (dataRecords.length > MAX_DATA_ROWS) {
    return {
      services: [],
      errors: [
        fileError(
          side,
          `The file has more than ${MAX_DATA_ROWS.toLocaleString()} data rows. Each bill file may contain at most ${MAX_DATA_ROWS.toLocaleString()} Services.`,
        ),
      ],
    };
  }

  const errors: ValidationError[] = [];
  const services: ValidatedService[] = [];
  const firstLineByService = new Map<string, number>();

  for (const record of dataRecords) {
    const { line, fields } = record;
    const rowErrors: ValidationError[] = [];

    if (fields.length < minimumFields) {
      rowErrors.push(
        cellError(
          side,
          line,
          "service",
          `Expected at least ${minimumFields} columns but found ${fields.length}.`,
        ),
      );
      errors.push(...rowErrors);
      continue;
    }

    const serviceName = fieldAt(fields, columnIndex.service).trim();
    if (serviceName === "") {
      rowErrors.push(
        cellError(side, line, "service", "The Service name is empty."),
      );
    } else if (firstLineByService.has(serviceName)) {
      rowErrors.push(
        cellError(
          side,
          line,
          "service",
          `Duplicate Service "${serviceName}": it already appears on Source line ${firstLineByService.get(serviceName)}. Each Service may appear once per file.`,
        ),
      );
    } else {
      firstLineByService.set(serviceName, line);
    }

    const quantityText = fieldAt(fields, columnIndex.quantity);
    const quantityProblem = validateDecimalText(quantityText);
    if (quantityProblem) {
      rowErrors.push(
        cellError(side, line, "quantity", quantityProblem),
      );
    }

    const unitPriceText = fieldAt(fields, columnIndex.unit_price);
    const unitPriceProblem = validateDecimalText(unitPriceText);
    if (unitPriceProblem) {
      rowErrors.push(
        cellError(side, line, "unit_price", unitPriceProblem),
      );
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    services.push({
      service: serviceName,
      quantity: new Decimal(quantityText.trim()),
      unitPrice: new Decimal(unitPriceText.trim()),
      source: { fileName, line },
    });
  }

  return { services, errors };
}
