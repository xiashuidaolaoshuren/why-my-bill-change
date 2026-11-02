import { parse } from "csv-parse/sync";

export type ParseRecord = {
  line: number;
  fields: string[];
};

export type ParseResult =
  | { ok: true; records: ParseRecord[] }
  | { ok: false };

type InfoRawRow = {
  info: { lines: number };
  record: string[];
  raw: string;
};

function internalLineBreakCount(raw: string): number {
  let body = raw;
  if (body.endsWith("\r\n")) {
    body = body.slice(0, -2);
  } else if (body.endsWith("\n") || body.endsWith("\r")) {
    body = body.slice(0, -1);
  }
  const breaks = body.match(/\r\n|\n|\r/g);
  return breaks?.length ?? 0;
}

function recordStartLine(infoLines: number, raw: string): number {
  return infoLines - internalLineBreakCount(raw);
}

export function parseCsv(text: string): ParseResult {
  try {
    const rows = parse(text, {
      bom: true,
      info: true,
      raw: true,
      skip_empty_lines: true,
      relax_column_count: true,
      columns: false,
    }) as unknown as InfoRawRow[];

    const records = rows.map(({ info, record, raw }) => ({
      line: recordStartLine(info.lines, raw),
      fields: record,
    }));

    return { ok: true, records };
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;

    if (code === "CSV_QUOTE_NOT_CLOSED") {
      return { ok: false };
    }

    throw error;
  }
}
