import { compareBills } from "../../../core/compare";
import type { Comparison } from "../../../core/compare";
import { toCompareResponse } from "../../../core/present";
import type { ValidatedService } from "../../../core/validate";
import {
  decodeBillText,
  fileError,
  validateBill,
} from "../../../core/validate";
import type { BillSide, ValidationError } from "../../../core/validate";

const MISSING_FILE_MESSAGE = "Upload a CSV file for this bill.";

type CompareFn = (
  before: ValidatedService[],
  after: ValidatedService[],
) => Comparison;

function missingFileError(file: BillSide): ValidationError {
  return {
    file,
    line: null,
    column: null,
    message: MISSING_FILE_MESSAGE,
    source: null,
  };
}

function logCompare(outcome: {
  outcome: "ok" | "validation" | "reconciliation";
  status: number;
  beforeRows: number;
  afterRows: number;
  durationMs: number;
  errorCategory: "validation" | "reconciliation" | null;
}): void {
  console.info({
    outcome: outcome.outcome,
    status: outcome.status,
    beforeRows: outcome.beforeRows,
    afterRows: outcome.afterRows,
    durationMs: outcome.durationMs,
    errorCategory: outcome.errorCategory,
  });
}

export async function handleCompare(
  request: Request,
  compare: CompareFn = compareBills,
): Promise<Response> {
  const started = performance.now();
  const formData = await request.formData();

  const beforeField = formData.get("before");
  const afterField = formData.get("after");

  const errors: ValidationError[] = [];
  let beforeServices: ValidatedService[] = [];
  let afterServices: ValidatedService[] = [];
  let beforeRows = 0;
  let afterRows = 0;

  if (!(beforeField instanceof File)) {
    errors.push(missingFileError("before"));
  } else {
    const decoded = decodeBillText(
      new Uint8Array(await beforeField.arrayBuffer()),
    );
    if (!decoded.ok) {
      errors.push(
        fileError(
          "before",
          "The file is not valid UTF-8. Save the bill as UTF-8 CSV.",
        ),
      );
    } else {
      const before = validateBill({
        side: "before",
        fileName: beforeField.name,
        text: decoded.text,
      });
      beforeServices = before.services;
      beforeRows = before.services.length;
      errors.push(...before.errors);
    }
  }

  if (!(afterField instanceof File)) {
    errors.push(missingFileError("after"));
  } else {
    const decoded = decodeBillText(
      new Uint8Array(await afterField.arrayBuffer()),
    );
    if (!decoded.ok) {
      errors.push(
        fileError(
          "after",
          "The file is not valid UTF-8. Save the bill as UTF-8 CSV.",
        ),
      );
    } else {
      const after = validateBill({
        side: "after",
        fileName: afterField.name,
        text: decoded.text,
      });
      afterServices = after.services;
      afterRows = after.services.length;
      errors.push(...after.errors);
    }
  }

  const durationMs = Math.round(performance.now() - started);

  if (errors.length > 0) {
    logCompare({
      outcome: "validation",
      status: 400,
      beforeRows,
      afterRows,
      durationMs,
      errorCategory: "validation",
    });
    return Response.json({ errors }, { status: 400 });
  }

  try {
    const body = toCompareResponse(compare(beforeServices, afterServices));
    logCompare({
      outcome: "ok",
      status: 200,
      beforeRows,
      afterRows,
      durationMs,
      errorCategory: null,
    });
    return Response.json(body);
  } catch {
    logCompare({
      outcome: "reconciliation",
      status: 500,
      beforeRows,
      afterRows,
      durationMs,
      errorCategory: "reconciliation",
    });
    return Response.json({ error: "reconciliation" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCompare(request);
}
