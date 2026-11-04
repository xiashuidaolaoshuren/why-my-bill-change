export type BillFiles = { before: File; after: File };

export type SampleDemoId = "headline" | "rounding" | "invalid" | "opposing";

export type SampleDemo = {
  id: SampleDemoId;
  label: string;
  blurb: string;
  load: () => Promise<BillFiles>;
};

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

async function loadPair(beforeName: string, afterName: string): Promise<BillFiles> {
  const [beforeText, afterText] = await Promise.all([
    fetchSample(beforeName),
    fetchSample(afterName),
  ]);
  return {
    before: toCsvFile(beforeName, beforeText),
    after: toCsvFile(afterName, afterText),
  };
}

/** Headline pair from the repo samples directory. */
export async function loadHeadlineSample(): Promise<BillFiles> {
  return loadPair("before.csv", "after.csv");
}

/** Sub-cent effects that trigger the display-rounding notice. */
export async function loadRoundingSample(): Promise<BillFiles> {
  return loadPair("rounding-before.csv", "rounding-after.csv");
}

/** Invalid before bill with valid after, for the error path demo. */
export async function loadInvalidSample(): Promise<BillFiles> {
  return loadPair("invalid-before.csv", "after.csv");
}

/** Two changed Services with opposing usage effects; Usage Bucket total is zero. */
export async function loadOpposingSample(): Promise<BillFiles> {
  return loadPair("opposing-before.csv", "opposing-after.csv");
}

export const SAMPLE_DEMOS: SampleDemo[] = [
  {
    id: "headline",
    label: "Headline",
    blurb: "Every Bucket moves",
    load: loadHeadlineSample,
  },
  {
    id: "rounding",
    label: "Rounding",
    blurb: "Sub-cent effects",
    load: loadRoundingSample,
  },
  {
    id: "invalid",
    label: "Invalid",
    blurb: "Errors by Source line",
    load: loadInvalidSample,
  },
  {
    id: "opposing",
    label: "Opposing",
    blurb: "A zero-total Bucket",
    load: loadOpposingSample,
  },
];

export async function loadSample(id: SampleDemoId): Promise<BillFiles> {
  const demo = SAMPLE_DEMOS.find((entry) => entry.id === id);
  if (!demo) {
    throw new Error(FAILURE_MESSAGE);
  }
  return demo.load();
}

export { FAILURE_MESSAGE as SAMPLE_LOAD_FAILURE };
