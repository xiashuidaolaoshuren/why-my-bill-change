import type { BillSide, ValidationError } from "@/core/validate";

const SIDE_ORDER: BillSide[] = ["before", "after"];

const SIDE_LABEL: Record<BillSide, string> = {
  before: "Before bill",
  after: "After bill",
};

const ICON_PATHS = {
  alert: ["M8 2.5 14 13.5H2Z", "M8 6.75v3", "M8 11.6v.15"],
  check: ["M3 8.5 6.5 12 13 4.5"],
} as const;

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      className="od-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ValidationErrors({
  errors,
  fileNames,
}: {
  errors: ValidationError[];
  fileNames: { before: string; after: string };
}) {
  return (
    <div className="error-groups">
      {SIDE_ORDER.map((side) => {
        const list = errors.filter((entry) => entry.file === side);
        const titleId = `error-${side}`;
        const fileName = fileNames[side];
        if (list.length === 0) {
          return (
            <section
              key={side}
              className="error-group is-clean"
              aria-labelledby={titleId}
            >
              <div className="error-group-head">
                <h2 className="error-group-title" id={titleId}>
                  {SIDE_LABEL[side]}
                </h2>
                <p className="error-file">{fileName}</p>
                <p className="error-count">
                  <Icon name="check" />
                  <span>No problems found</span>
                </p>
              </div>
            </section>
          );
        }

        const sorted = [...list].sort(
          (a, b) => (a.line ?? 0) - (b.line ?? 0),
        );

        return (
          <section key={side} className="error-group" aria-labelledby={titleId}>
            <div className="error-group-head">
              <h2 className="error-group-title" id={titleId}>
                {SIDE_LABEL[side]}
              </h2>
              <p className="error-file">{fileName}</p>
              <p className="error-count">
                <Icon name="alert" />
                <span>{plural(sorted.length, "problem")}</span>
              </p>
            </div>
            <ul className="validation-errors validation-errors-group">
              {sorted.map((entry, index) => (
                <li
                  key={`${entry.file}-${entry.line}-${entry.column}-${index}`}
                >
                  {entry.line !== null ? (
                    <>
                      line {entry.line}
                      {entry.column ? ` · ${entry.column}` : ""}
                      {" — "}
                    </>
                  ) : null}
                  {entry.message}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
