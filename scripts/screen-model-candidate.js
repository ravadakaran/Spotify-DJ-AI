import { readFile, writeFile } from "node:fs/promises";
import { generate, retrieve, ollamaAdapter } from "../server/src/grounding.js";
const model = process.env.OLLAMA_MODEL;
if (!model) throw new Error("Set OLLAMA_MODEL");
const manifest = JSON.parse(
  await readFile("data/evaluations/legal-demo/manifest.json", "utf8"),
);
const source = manifest.tracks[2],
  protocol = JSON.parse(
    await readFile("evidence/acceptance-model-protocol.json", "utf8"),
  );
const track = {
  _id: "candidate-audit-caesium",
  profileVersion: 1,
  profileStatus: "ready",
  acoustic: source.acoustic,
  timeline: [
    {
      id: "publisher",
      ts: 0,
      type: "trivia",
      text: `Artist: ${source.artist}. Album: Everything is Free. Publisher specifies ${source.bpm} BPM in ${source.key}. License: CC0-1.0.`,
      sourceLabel: `Original publisher metadata at ${manifest.upstreamCommit}`,
    },
  ],
};
const audit = [];
for (const item of protocol.cases) {
  const context = retrieve(track, item.question);
  const result = await generate(
    context,
    item.question,
    ollamaAdapter(model),
    10000,
  );
  audit.push({
    ...item,
    ...result,
    correct: item.supported
      ? !result.insufficientMetadata && result.generationMode === "model"
      : result.insufficientMetadata,
  });
  console.log(
    `${audit.length}: ${result.generationMode} correct=${audit.at(-1).correct}`,
  );
}
const report = {
  date: new Date().toISOString(),
  model,
  kind: "Candidate Q&A screen; not a trigger-to-render benchmark",
  audit,
  pass: audit.every((item) => item.correct),
};
await writeFile(
  "evidence/acceptance-model-candidate-screen.json",
  JSON.stringify(report, null, 2),
);
if (!report.pass) process.exitCode = 1;
