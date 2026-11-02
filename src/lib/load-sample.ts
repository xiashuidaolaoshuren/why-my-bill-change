export type BillFiles = { before: File; after: File };

const FAILURE_MESSAGE =
  "The comparison could not be completed. Nothing from it is shown.";

async function fetchSample(name: string): Promise<string> {
  const response = await fetch(`/samples/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(FAILURE_MESSAGE);
  }
  return response.text();
}

function toCsvFile(name: string, text: string): File {
  return new File([text], name, { type: "text/csv", lastModified: Date.now() });
}

/** Headline pair from the repo samples directory. */
export async function loadHeadlineSample(): Promise<BillFiles> {
  const [beforeText, afterText] = await Promise.all([
    fetchSample("before.csv"),
    fetchSample("after.csv"),
  ]);
  return {
    before: toCsvFile("before.csv", beforeText),
    after: toCsvFile("after.csv", afterText),
  };
}

/** Invalid before bill with valid after, for the error path demo. */
export async function loadInvalidSample(): Promise<BillFiles> {
  const [beforeText, afterText] = await Promise.all([
    fetchSample("invalid-before.csv"),
    fetchSample("after.csv"),
  ]);
  return {
    before: toCsvFile("invalid-before.csv", beforeText),
    after: toCsvFile("after.csv", afterText),
  };
}

export { FAILURE_MESSAGE as SAMPLE_LOAD_FAILURE };
