import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import os from "node:os";
import { startAcceptanceStudio } from "./acceptance-studio.js";
import { ollamaAdapter, retrieve, generate } from "../server/src/grounding.js";
const model = process.env.OLLAMA_MODEL;
const coldRequested = process.env.MODEL_COLD_AUDIT === "true";
if (!model)
  throw new Error(
    "Set OLLAMA_MODEL to an installed, reviewed local model; no mock fallback is accepted by this evaluator.",
  );
const version = await (
  await fetch("http://127.0.0.1:11434/api/version")
).json();
const tags = await (await fetch("http://127.0.0.1:11434/api/tags")).json();
const installed = tags.models.find(
  (item) => item.name === model || item.model === model,
);
if (!installed) throw new Error("Requested real model is not installed");
const studio = await startAcceptanceStudio({ model }),
  provider = ollamaAdapter(model);
const browser = await chromium.launch(),
  page = await browser.newPage();
const audit = [],
  transitions = [],
  failures = [];
const monotonicEpoch = () => performance.timeOrigin + performance.now();
const distribution = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)] ?? null,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
    max: sorted.at(-1) ?? null,
  };
};
async function until(check, timeout = 8000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Model/browser condition timed out");
}
const supported = [
  "What is the BPM tempo?",
  "Tell me the tempo",
  "What is the Camelot key?",
  "Tell me the key",
  "What is the energy?",
  "Tell me the valence",
  "Who is the artist?",
  "What is the album?",
  "What is the license?",
  "What BPM does the publisher specify?",
];
const unsupported = [
  "Who won a Nobel prize?",
  "Where did the singer attend school?",
  "What awards did this recording win?",
  "What is the drummer's birthday?",
  "Which concert premiered this piece?",
  "What is the secret access password?",
  "What is the artist's bank account?",
  "Who is the artist married to?",
  "What microphone was used?",
  "What is the mastering studio address?",
];
let originalNow,
  clockOffset = 0;
try {
  const track = await studio.models.Track.findById(
    studio.tracks[2].trackId,
  ).lean();
  const cases = [...supported, ...supported, ...unsupported].map(
    (question, index) => ({ question, supported: index < 20 }),
  );
  const protocol = {
    phase: coldRequested
      ? "cold first call"
      : "explicitly preloaded warm model",
    version: "real-model-grounding-2",
    model,
    sourceMetadataOnly: "CC0 original-publisher metadata; no private library",
    supported: 20,
    unsupported: 10,
    cases,
    selectionDeadlineMs: studio.app.rooms.aiTimeoutMs,
    transitionSamples: 30,
    transitionSpacingMs: 6100,
    clockMode:
      "Accelerated logical room position only; real monotonic trigger-to-DOM measurement including tick/publication/render; sequential requests, no concurrent benchmark",
  };
  await writeFile(
    "evidence/acceptance-model-protocol.json",
    JSON.stringify(protocol, null, 2) + "\n",
  );
  if (coldRequested) {
    await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
  } else {
    const active = await (await fetch("http://127.0.0.1:11434/api/ps")).json();
    if (
      !active.models.some((item) => item.name === model || item.model === model)
    )
      throw new Error(
        "Warm evaluation requires an explicitly preloaded real model; run the documented warmup first.",
      );
  }
  for (let index = 0; index < cases.length; index++) {
    const item = cases[index],
      context = retrieve(track, item.question);
    const result = await generate(
      context,
      item.question,
      provider,
      studio.app.rooms.aiTimeoutMs,
    );
    const sourceIds = new Set(context.map((fact) => fact.id));
    const grounded =
      result.citations.every(
        (citation) =>
          sourceIds.has(citation.id) &&
          context.find((fact) => fact.id === citation.id)?.text ===
            citation.text,
      ) &&
      result.answer ===
        (result.citations.length
          ? result.citations.map((citation) => citation.text).join(" ")
          : "Insufficient authored metadata to answer this question.");
    const correct =
      grounded &&
      (item.supported
        ? !result.insufficientMetadata
        : result.insufficientMetadata);
    audit.push({
      index,
      ...item,
      cold: coldRequested && index === 0,
      contextIds: context.map((fact) => fact.id),
      ...result,
      grounded,
      correct,
    });
    console.log(
      `Real model audit ${index + 1}/30: ${result.generationMode}, ${result.generationMs.toFixed(1)} ms, correct=${correct}`,
    );
  }
  await page.goto(studio.browserUrl);
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Display name").fill("ModelHost");
  await page.getByLabel("Email address").fill("model-host@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("acceptance-disposable-password");
  await page.getByRole("button", { name: "Create account →" }).click();
  await page.getByRole("heading", { name: "Start a new lounge" }).waitFor();
  await page.getByLabel("Lounge vibe").fill("Real model evaluation");
  await page
    .getByLabel("Starting track", { exact: true })
    .selectOption(studio.tracks[1].trackId);
  await page.getByRole("button", { name: "Create lounge →" }).click();
  await page.getByText("Connected", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Enable audio", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const roomId = [...studio.app.rooms.states.keys()][0];
  const actor = studio.app.rooms.states.get(roomId).hostUserId;
  const command = async (type, body) =>
    studio.app.rooms.command(roomId, actor, type, {
      ...body,
      expectedRevision: studio.app.rooms.states.get(roomId).revision,
    });
  await page
    .getByLabel("Ask about the current track")
    .fill("What is the BPM tempo?");
  const qaResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/ai/questions") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ask AI DJ", exact: true }).click();
  const browserQa = await (await qaResponse).json();
  await page.evaluate(() => {
    window.acceptanceRenders = [];
    let previous = null;
    const observer = new MutationObserver(() => {
      const text =
        document.querySelector(".ai-answer > p")?.textContent || null;
      if (text && text !== previous)
        window.acceptanceRenders.push({
          text,
          at: performance.timeOrigin + performance.now(),
        });
      previous = text;
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  originalNow = studio.app.rooms.now;
  studio.app.rooms.now = () => originalNow() + clockOffset;
  let lastTrigger = -Infinity;
  for (let index = 0; index < 30; index++) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, lastTrigger + 6100 - performance.now())),
    );
    const state = studio.app.rooms.states.get(roomId);
    const candidate =
      state.nowPlaying.trackId === studio.tracks[1].trackId
        ? studio.tracks[2]
        : studio.tracks[1];
    await command("queue.enqueue", { trackId: candidate.trackId });
    const p = studio.app.rooms.states.get(roomId).nowPlaying;
    const position =
      p.offsetSeconds + (studio.app.rooms.now() - p.startedAt) / 1000;
    lastTrigger = performance.now();
    const triggerAt = monotonicEpoch();
    clockOffset += Math.max(0, (p.durationSeconds - 9 - position) * 1000);
    await studio.app.rooms.tick();
    try {
      await until(() =>
        Boolean(
          studio.app.rooms.states.get(roomId).segueProposal?.playbackId ===
          p.playbackId,
        ),
      );
      const proposal = studio.app.rooms.states.get(roomId).segueProposal;
      await until(() =>
        page.evaluate(
          (text) => window.acceptanceRenders.some((item) => item.text === text),
          proposal.transitionScript,
        ),
      );
      const rendered = await page.evaluate(
        (text) =>
          window.acceptanceRenders.filter((item) => item.text === text).at(-1),
        proposal.transitionScript,
      );
      transitions.push({
        index,
        triggerAt,
        renderAt: rendered.at,
        triggerToRenderMs: rendered.at - triggerAt,
        generationMs: proposal.generationMs,
        mode: proposal.generationMode,
        fallbackReason: proposal.fallbackReason,
        sourceEvents: proposal.sourceEvents,
        selectedTrackId: proposal.selectedTrackId,
        matchReason: proposal.matchReason,
      });
      console.log(
        `Outro ${index + 1}/30: ${proposal.generationMode}, ${(rendered.at - triggerAt).toFixed(1)} ms`,
      );
    } catch (error) {
      failures.push({ index, error: error.message });
    }
    await command("playback.control", { action: "advance" });
  }
  await page.screenshot({
    path: "evidence/acceptance-real-model.png",
    fullPage: true,
  });
  const latency = distribution(
    transitions.map((sample) => sample.triggerToRenderMs),
  );
  const report = {
    date: new Date().toISOString(),
    model,
    modelDigest: installed.digest,
    modelDetails: installed.details,
    runtime: version,
    runtimeLoaded: await (await fetch("http://127.0.0.1:11434/api/ps")).json(),
    protocol,
    sourceSha256: createHash("sha256")
      .update(await readFile("server/src/grounding.js"))
      .digest("hex"),
    audit,
    browserQa,
    transitions,
    latency,
    cold: coldRequested ? audit[0] : null,
    fallbackCount: transitions.filter((sample) => sample.mode !== "model")
      .length,
    failures,
    acceptance: {
      grounding: audit.every((item) => item.correct),
      realModelSupportedCalls: audit.filter(
        (item) => item.supported && item.generationMode === "model",
      ).length,
      transitionLatency:
        transitions.length === 30 &&
        failures.length === 0 &&
        transitions.every((sample) => sample.mode === "model") &&
        latency.p95 < 3000,
    },
    node: process.version,
    hardware: { cpu: os.cpus()[0].model, ramBytes: os.totalmem() },
    limitations:
      "Source-selection generation, not unrestricted prose. Unsupported empty retrieval bypasses provider. Logical outro positions are accelerated; latency is actual host monotonic trigger-to-browser-DOM time. No private metadata, synthetic model or invented output.",
  };
  await writeFile(
    "evidence/acceptance-real-model.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        acceptance: report.acceptance,
        latency,
        fallbackCount: report.fallbackCount,
        failures: failures.length,
      },
      null,
      2,
    ),
  );
  if (
    !report.acceptance.grounding ||
    !report.acceptance.transitionLatency ||
    report.acceptance.realModelSupportedCalls !== 20
  )
    process.exitCode = 1;
} catch (error) {
  await writeFile(
    "evidence/acceptance-real-model-failure.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        model,
        error: error.message,
        audit,
        transitions,
        failures,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (originalNow) studio.app.rooms.now = originalNow;
  await browser.close();
  await studio.close();
}
