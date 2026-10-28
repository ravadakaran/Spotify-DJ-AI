import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { startAcceptanceStudio } from "./acceptance-studio.js";
import { match } from "../server/src/music-engine.js";
import os from "node:os";
const studio = await startAcceptanceStudio({ model: process.env.OLLAMA_MODEL });
const browser = await chromium.launch();
const hostContext = await browser.newContext(),
  guestContext = await browser.newContext();
const host = await hostContext.newPage(),
  guest = await guestContext.newPage();
const samples = [],
  errors = [];
host.on("pageerror", (error) => errors.push(error.message));
guest.on("pageerror", (error) => errors.push(error.message));
async function until(check, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Browser condition timed out");
}
async function register(page, name) {
  await page.goto(studio.browserUrl);
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Display name").fill(name);
  await page
    .getByLabel("Email address")
    .fill(`${name.toLowerCase()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("acceptance-disposable-password");
  await page.getByRole("button", { name: "Create account →" }).click();
  await page.getByRole("heading", { name: "Start a new lounge" }).waitFor();
}
async function choose(page, label, id) {
  const field = page.getByLabel(label, { exact: true });
  await field.locator(`option[value="${id}"]`).waitFor({ state: "attached" });
  await field.selectOption(id);
}
async function checkTrack(page, title) {
  await until(
    async () => (await page.locator(".player h2").textContent()) === title,
  );
  await until(() =>
    page
      .getByLabel("Lounge audio")
      .evaluate(
        (audio) =>
          audio.readyState >= 2 &&
          !audio.paused &&
          !audio.muted &&
          audio.currentTime > 0.5,
      ),
  );
  const pcm = await page.getByLabel("Lounge audio").evaluate(async (audio) => {
    if (!audio.captureStream) return { supported: false };
    const stream = audio.captureStream(),
      context = new AudioContext();
    await context.resume();
    const source = context.createMediaStreamSource(stream),
      analyser = context.createAnalyser();
    source.connect(analyser);
    const values = new Float32Array(analyser.fftSize);
    let maxRms = 0;
    try {
      for (let index = 0; index < 30; index++) {
        analyser.getFloatTimeDomainData(values);
        maxRms = Math.max(
          maxRms,
          Math.sqrt(
            values.reduce((sum, value) => sum + value * value, 0) /
              values.length,
          ),
        );
        if (maxRms > 0.000001) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      source.disconnect();
      await context.close();
      stream.getTracks().forEach((track) => track.stop());
    }
    return { supported: true, maxRms };
  });
  if (!pcm.supported || !(pcm.maxRms > 0.000001))
    throw new Error(`No non-silent decoded PCM measured for ${title}`);
  return {
    title,
    at: new Date().toISOString(),
    pcm,
    ...(await page.getByLabel("Lounge audio").evaluate((audio) => ({
      currentTime: audio.currentTime,
      readyState: audio.readyState,
      muted: audio.muted,
      audioElements: document.querySelectorAll(
        'audio[aria-label="Lounge audio"]',
      ).length,
    }))),
  };
}
let report;
try {
  await register(host, "LegalHost");
  await host.getByLabel("Lounge vibe").fill("Authorized real-audio chain");
  await choose(host, "Starting track", studio.tracks[0].trackId);
  await host.getByRole("button", { name: "Create lounge →" }).click();
  await host.getByText("Connected", { exact: true }).waitFor();
  const invite = await host.locator(".invite-banner code").textContent();
  await register(guest, "LegalGuest");
  await guest.getByLabel("Invite code").fill(invite);
  await guest.getByRole("button", { name: "Join lounge ↗" }).click();
  await guest.getByText("Connected", { exact: true }).waitFor();
  for (const track of studio.tracks.slice(1)) {
    await choose(host, "Add a track", track.trackId);
    await host
      .getByRole("button", { name: "Add to queue", exact: true })
      .click();
    await until(
      async () =>
        (await host.locator(".queue-row").count()) ===
        studio.tracks.indexOf(track),
    );
  }
  await host.getByRole("button", { name: "Enable audio", exact: true }).click();
  await guest
    .getByRole("button", { name: "Enable audio", exact: true })
    .click();
  await host.getByRole("button", { name: "Play", exact: true }).click();
  for (let index = 0; index < studio.tracks.length; index++) {
    if (index)
      await host
        .getByRole("button", { name: "Skip / Advance", exact: true })
        .click();
    samples.push({
      track: studio.tracks[index].title,
      clients: await Promise.all(
        [host, guest].map((page) =>
          checkTrack(page, studio.tracks[index].title),
        ),
      ),
    });
    console.log(
      `Played real CC0 recording on two clients: ${studio.tracks[index].title}`,
    );
  }
  await guest.reload();
  await guest
    .getByRole("button", { name: /Authorized real-audio chain .* ↗/ })
    .click();
  await guest.getByText("Connected", { exact: true }).waitFor();
  await until(
    async () => (await guest.locator(".player h2").textContent()) === "Caesium",
  );
  let browserUnknown = null;
  if (process.env.OLLAMA_MODEL) {
    await host.getByLabel("Ask about the current track").fill("What is the artist's bank account?");
    const response = host.waitForResponse(item => item.url().includes("/ai/questions") && item.request().method() === "POST");
    await host.getByRole("button", { name: "Ask AI DJ", exact: true }).click();
    browserUnknown = await (await response).json();
    if (browserUnknown.generationMode !== "model" || !browserUnknown.insufficientMetadata || browserUnknown.sourceEvents.length)
      throw new Error("Real-model browser refusal did not meet acceptance");
  }
  await mkdir("evidence", { recursive: true });
  await host.screenshot({
    path: "evidence/acceptance-legal-chain.png",
    fullPage: true,
  });
  const state = [...studio.app.rooms.states.values()][0];
  await studio.app.rooms.writer.flush();
  const starts = await studio.models.QueueEvent.find({
    loungeId: state.loungeId,
    type: "playback.start",
  })
    .sort({ occurredAt: 1 })
    .lean();
  const transitions = starts.slice(1).map((event, index) => ({
    from: starts[index].payload.track.title,
    to: event.payload.track.title,
    match: match(
      starts[index].payload.track.acoustic,
      event.payload.track.acoustic,
      state.settings.bpmTolerancePct,
    ),
  }));
  report = {
    date: new Date().toISOString(),
    pass:
      samples.length === 3 &&
      starts.length === 3 &&
      transitions.every((edge) => edge.match) &&
      errors.length === 0,
    mode: "Real unmodified CC0 recordings; authenticated two-browser playback; manual validated Advance between songs; no claim of full-duration natural ends",
    sourceManifest: "acceptance-legal-media.json",
    samples,
    transitions,
    reconnect: { track: "Caesium", matched: true },
    pageErrors: errors,
    browserUnknown,
    node: process.version,
    hardware: { cpu: os.cpus()[0].model, ramBytes: os.totalmem() },
  };
  await writeFile(
    "evidence/acceptance-legal-chain.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ pass: report.pass, transitions }, null, 2));
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  await writeFile(
    "evidence/acceptance-legal-chain-failure.json",
    JSON.stringify(
      { date: new Date().toISOString(), error: error.message, samples, errors },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await studio.close();
}
