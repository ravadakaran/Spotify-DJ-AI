import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import { scoreSentiment, SENTIMENT_VERSION } from "../server/src/sentiment.js";
const source = await readFile(
  new URL("../server/tests/fixtures/sentiment-locked.json", import.meta.url),
);
const dataset = JSON.parse(source),
  labels = ["positive", "neutral", "negative"];
const confusion = Object.fromEntries(
  labels.map((label) => [label, Object.fromEntries(labels.map((l) => [l, 0]))]),
);
const failures = [];
let count = 0,
  correct = 0;
for (const label of labels)
  for (const text of dataset[label]) {
    const actual = scoreSentiment(text).sentimentBucket;
    count++;
    confusion[label][actual]++;
    if (actual === label) correct++;
    else failures.push({ text, expected: label, actual });
  }
const report = {
  algorithmVersion: SENTIMENT_VERSION,
  datasetVersion: dataset.version,
  datasetSha256: createHash("sha256").update(source).digest("hex"),
  scorerSha256: createHash("sha256")
    .update(
      await readFile(new URL("../server/src/sentiment.js", import.meta.url)),
    )
    .digest("hex"),
  provenance: dataset.provenance,
  count,
  correct,
  accuracy: correct / count,
  confusionRowsExpectedColumnsPredicted: confusion,
  failures,
  node: process.version,
  cpu: os.cpus()[0].model,
  memoryGiB: Math.round(os.totalmem() / 1024 ** 3),
  evaluatedAt: new Date().toISOString(),
};
await writeFile(
  new URL("../evidence/phase-four-sentiment.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
