import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import { scoreSentiment, SENTIMENT_VERSION } from "../server/src/sentiment.js";
const protocolBytes = await readFile(
  "evidence/acceptance-sentiment-protocol.json",
);
const protocol = JSON.parse(protocolBytes.toString().replace(/^\uFEFF/, ""));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (hash(await readFile("server/src/sentiment.js")) !== protocol.scorerSha256)
  throw new Error(
    "Scorer differs from predeclared protocol; create a separate evaluation protocol before using a new untouched dataset.",
  );
const base = `https://raw.githubusercontent.com/google-research/google-research/${protocol.upstreamCommit}/goemotions/data/`;
async function download(name) {
  const response = await fetch(`${base}${name}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Dataset download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(`data/evaluations/${name}`, bytes);
  return bytes;
}
await mkdir("data/evaluations", { recursive: true });
const [test, emotionsBytes, groupsBytes] = await Promise.all([
  download("test.tsv"),
  download("emotions.txt"),
  download("sentiment_dict.json"),
]);
const emotions = emotionsBytes.toString().trim().split(/\r?\n/),
  groups = JSON.parse(groupsBytes);
const labels = ["positive", "neutral", "negative"];
const confusion = Object.fromEntries(
  labels.map((label) => [
    label,
    Object.fromEntries(labels.map((actual) => [actual, 0])),
  ]),
);
const excluded = { ambiguousOrMixed: 0 },
  errors = [];
let count = 0,
  correct = 0;
for (const row of test.toString().trimEnd().split(/\r?\n/)) {
  const [text, indexes, id] = row.split("\t");
  const mapped = indexes.split(",").map((index) => {
    const emotion = emotions[Number(index)];
    return emotion === "neutral"
      ? "neutral"
      : Object.keys(groups).find((group) => groups[group].includes(emotion));
  });
  if (
    mapped.some((label) => !labels.includes(label)) ||
    new Set(mapped).size !== 1
  ) {
    excluded.ambiguousOrMixed++;
    continue;
  }
  const expected = mapped[0],
    actual = scoreSentiment(text).sentimentBucket;
  confusion[expected][actual]++;
  count++;
  if (expected === actual) correct++;
  else errors.push({ id, expected, actual });
}
const perClass = Object.fromEntries(
  labels.map((label) => {
    const support = Object.values(confusion[label]).reduce((a, b) => a + b, 0);
    return [
      label,
      { support, recall: support ? confusion[label][label] / support : null },
    ];
  }),
);
const report = {
  date: new Date().toISOString(),
  protocolVersion: protocol.version,
  protocolHash: hash(protocolBytes),
  source: protocol.source,
  upstreamCommit: protocol.upstreamCommit,
  provenance: protocol.scope,
  algorithm: SENTIMENT_VERSION,
  scorerSha256: protocol.scorerSha256,
  datasetSha256: hash(test),
  mappingSha256: hash(groupsBytes),
  emotionLabelsSha256: hash(emotionsBytes),
  totalRows: count + excluded.ambiguousOrMixed,
  count,
  correct,
  accuracy: count ? correct / count : null,
  balancedAccuracy:
    labels.reduce((sum, label) => sum + perClass[label].recall, 0) / 3,
  perClass,
  excluded,
  confusionRowsExpectedColumnsPredicted: confusion,
  errors,
  threshold: protocol.threshold,
  pass: count > 0 && correct / count >= protocol.threshold,
  node: process.version,
  hardware: { cpu: os.cpus()[0].model, ramBytes: os.totalmem() },
};
await writeFile(
  "evidence/acceptance-independent-sentiment.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { ...report, errors: `${errors.length} error IDs in report` },
    null,
    2,
  ),
);
if (!report.pass) process.exitCode = 1;
