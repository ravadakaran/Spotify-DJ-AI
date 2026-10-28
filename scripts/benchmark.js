import { monitorEventLoopDelay } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import { fixture, emit } from "./phase-six-fixture.js";
import { seedProfiles } from "../server/src/persistence.js";

const participants = Number(process.env.BENCH_USERS || 10);
const seconds = Number(process.env.BENCH_SECONDS || 600);
const warmup = Number(process.env.BENCH_WARMUP || 60);
const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'));
const datasetHash = createHash('sha256').update(JSON.stringify(seedProfiles)).digest('hex');
if (
  ![participants, seconds, warmup].every(Number.isInteger) ||
  participants < 5 ||
  participants > 50 ||
  seconds < 1 ||
  warmup < 0
)
  throw new Error("Invalid benchmark configuration");
const f = await fixture(),
  traces = [],
  failures = [],
  resources = [],
  rooms = [];
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
const hash = (state) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        nextUp: state.nextUp,
        nowPlaying: state.nowPlaying,
        reservedEntryId: state.reservedEntryId,
      }),
    )
    .digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const distribution = (values) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const p = (q) =>
    v.length ? v[Math.min(v.length - 1, Math.ceil(v.length * q) - 1)] : null;
  return {
    samples: v.length,
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: v.at(-1) ?? null,
  };
};
try {
  for (let r = 0; r < 2; r++) {
    const users = [];
    for (let u = 0; u < participants; u++)
      users.push(await f.user(r * participants + u));
    const room = await f.room(users[0]);
    for (const user of users.slice(1))
      await f.app.rooms.join(user.id, { inviteCode: room.inviteCode });
    const clients = [];
    for (const user of users) {
      const socket = await f.socket(user, room),
        applied = new Map();
      socket.on("lounge.state.snapshot", (event) => {
        if (event.loungeId !== room.loungeId)
          failures.push({ type: "cross-room" });
        applied.set(event.revision, {
          at: performance.now(),
          hash: hash(event.payload),
        });
        // Retain only the bounded receipt window, including during the long run.
        if (applied.size > 256) applied.delete(applied.keys().next().value);
      });
      socket.on("disconnect", (reason) =>
        failures.push({ type: "disconnect", reason }),
      );
      clients.push({ socket, applied });
    }
    const state = await f.app.rooms.snapshot(room.loungeId);
    await f.app.rooms.command(room.loungeId, users[0].id, "queue.enqueue", {
      trackId: seedProfiles[1]._id,
      expectedRevision: state.revision,
    });
    rooms.push({
      ...room,
      users,
      clients,
      entryId: (await f.app.rooms.snapshot(room.loungeId)).nextUp[0].entryId,
    });
  }
  const original = f.app.rooms.command.bind(f.app.rooms),
    received = new Map();
  f.app.rooms.command = async (...args) => {
    const at = performance.now(),
      result = await original(...args);
    received.set(`${args[0]}:${result.revision}`, at);
    if (received.size > 512) received.delete(received.keys().next().value);
    return result;
  };
  const start = performance.now();
  async function mutate(room, tick) {
    const c = room.clients[tick % participants],
      at = performance.now();
    const type = tick % 2 === 0 ? "queue.vote" : "chat.message";
    const payload =
      type === "queue.vote"
        ? {
            entryId: room.entryId,
            upvoted: Math.floor(tick / participants) % 2 === 0,
          }
        : { body: "Great energy synthetic load" };
    const ack = await emit(c.socket, "lounge.command", { type, payload });
    if (!ack.ok) throw new Error(JSON.stringify(ack));
    const revision = ack.revision;
    const deadline = performance.now() + 2000;
    while (
      !room.clients.every((c) => c.applied.has(revision)) &&
      performance.now() < deadline
    )
      await sleep(2);
    const applied = room.clients.map((c) => c.applied.get(revision));
    if (applied.some((x) => !x))
      throw new Error(`Missing applied revision ${revision}`);
    if (new Set(applied.map((x) => x.hash)).size !== 1)
      throw new Error("Divergent queue state");
    const times = applied.map((x) => x.at);
    if (at - start >= warmup * 1000)
      traces.push({
        room: rooms.indexOf(room),
        type,
        revision,
        elapsedMs: at - start,
        queueApplyMs:
          Math.max(...times) - received.get(`${room.loungeId}:${revision}`),
        fanoutMs: Math.max(...times) - at,
        skewMs: Math.max(...times) - Math.min(...times),
      });
  }
  // Two votes and one chat per second per room; schedule against one monotonic clock.
  for (let tick = 0; tick < (seconds + warmup) * 3; tick++) {
    await sleep(Math.max(0, start + (tick * 1000) / 3 - performance.now()));
    await Promise.all(
      rooms.map(async (room) => {
        try {
          // Pattern 0,2 are votes, 1 is chat; rotate identities across all clients.
          const logical = tick % 3 === 1 ? tick * 2 + 1 : tick * 2;
          await mutate(room, logical);
          if (tick % 6 === 0) {
            const at = performance.now();
            const response = await fetch(`${f.url}/api/v1/tracks?limit=5`, {
              headers: {
                Authorization: `Bearer ${room.users[(tick / 6) % participants].token}`,
              },
            });
            if (response.status !== 200)
              throw new Error(`REST ${response.status}`);
            await response.json();
            if (at - start >= warmup * 1000)
              traces.push({
                room: rooms.indexOf(room),
                type: "REST",
                elapsedMs: at - start,
                durationMs: performance.now() - at,
              });
          }
        } catch (error) {
          failures.push({
            tick,
            room: rooms.indexOf(room),
            message: error.message,
          });
        }
      }),
    );
    if (tick % 30 === 0)
      resources.push({
        elapsedMs: performance.now() - start,
        ...process.memoryUsage(),
        eventLoopP99Ms: lag.percentile(99) / 1e6,
        bufferedEvents: f.app.rooms.writer.buffer.length,
      });
  }
  const queue = traces.filter((t) => t.type === "queue.vote"),
    fanout = traces.filter((t) => t.fanoutMs !== undefined);
  const report = {
    date: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    node: process.version,
    datasetHash,
    dependencies: Object.fromEntries(['express','socket.io','mongoose','multer','body-parser'].map(name=>[name,lockfile.packages[`node_modules/${name}`]?.version])),
    hardware: {
      cpu: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      ramBytes: os.totalmem(),
      platform: os.platform(),
    },
    workload: {
      rooms: 2,
      participantsPerRoom: participants,
      warmupSeconds: warmup,
      measurementSeconds: seconds,
      votesPerSecondPerRoom: 2,
      chatPerSecondPerRoom: 1,
      restRequestsPerSecondPerRoom: 0.5,
      client:
        "Node Socket.IO snapshot application; no browser render or network impairment",
      fixtures: "Three metadata profiles; no media or model calls",
    },
    queueMs: distribution(queue.map((t) => t.queueApplyMs)),
    fanoutMs: distribution(fanout.map((t) => t.fanoutMs)),
    skewMs: distribution(fanout.map((t) => t.skewMs)),
    restMs: distribution(
      traces.filter((t) => t.type === "REST").map((t) => t.durationMs),
    ),
    eventLoopMs: { p99: lag.percentile(99) / 1e6, max: lag.max / 1e6 },
    failures,
    resources,
    traces,
  };
  report.acceptance = {
    queue: report.queueMs.samples > 0 && report.queueMs.max < 100 && failures.length === 0,
    fanout: report.fanoutMs.samples > 0 && report.fanoutMs.max < 500 && failures.length === 0,
    rest: report.restMs.samples > 0 && report.restMs.p95 < 200 && failures.length === 0,
    ai: "unmeasured; real model gate open",
  };
  await mkdir("evidence", { recursive: true });
  await writeFile(
    `evidence/phase-six-load-${participants}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      workload: report.workload,
      queueMs: report.queueMs,
      fanoutMs: report.fanoutMs,
      restMs: report.restMs,
      failures: failures.length,
      acceptance: report.acceptance,
    }),
  );
  if (failures.length || !report.acceptance.queue || !report.acceptance.fanout || !report.acceptance.rest) process.exitCode = 1;
} finally {
  lag.disable();
  await f.close();
}

