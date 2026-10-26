import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { io } from "socket.io-client";
import { connect, migrate, seed, seedProfiles } from "../src/persistence.js";
import { createApplication } from "../src/app.js";
import { RoomService } from "../src/live-rooms.js";

let repl, db, app, folder, url;
const key = randomBytes(48).toString("hex"),
  origin = "http://127.0.0.1:5173",
  users = [],
  sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let n = 0; n < 100; n++) {
    if (await check()) return;
    await sleep(20);
  }
  throw new Error("Condition did not settle");
}
const emit = (socket, event, payload) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(3000)
      .emit(event, payload, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
  );
beforeAll(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-phase3-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("phase_three_tests"));
  await migrate(db.connection, db.models);
  await seed(db.models);
  app = createApplication({
    ...db,
    config: {
      key,
      issuer: "test",
      audience: "test",
      origin,
      secure: false,
      assetRoot: folder,
      handshakeLimit: 500,
      roomOptions: { graceMs: 60 },
    },
    logger: { info() {}, error() {} },
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${app.server.address().port}`;
  for (let i = 0; i < 12; i++) {
    const user = await db.models.User.create({
      emailNormalized: `p2-${i}@example.test`,
      displayName: `User ${i}`,
      passwordHash: "test-only-no-login",
    });
    const session = await db.models.Session.create({
      userId: user._id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    users.push({
      id: user._id,
      token: jwt.sign({ sid: session._id }, key, {
        subject: user._id,
        issuer: "test",
        audience: "test",
        expiresIn: "1h",
      }),
    });
  }
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await app?.close();
  await db?.connection.close();
  await repl?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});
async function socketFor(user, room) {
  const socket = io(`${url}/lounges`, {
    auth: { accessToken: user.token },
    extraHeaders: { Origin: origin },
    transports: ["websocket"],
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  if (room)
    expect(
      (await emit(socket, "lounge.subscribe", { loungeId: room.loungeId })).ok,
    ).toBe(true);
  return socket;
}
async function roomFor(count = 2) {
  const room = await app.rooms.create(users[0].id, {
    seedTrackId: seedProfiles[0]._id,
    vibeProfile: "Phase two test",
    maxParticipants: 20,
    bpmTolerancePct: 8,
    soundclashEnabled: true,
    aiVerbosity: "normal",
  });
  for (let i = 1; i < count; i++)
    await app.rooms.join(users[i].id, { inviteCode: room.inviteCode });
  const host = await socketFor(users[0], room);
  return { room, host };
}
async function command(room, user, type, payload = {}) {
  const state = await app.rooms.snapshot(room.loungeId);
  return app.rooms.command(room.loungeId, user.id, type, {
    ...payload,
    ...(type !== "queue.vote" && type !== "member.leave"
      ? { expectedRevision: state.revision }
      : {}),
  });
}

test("Phase 3 full A→B→C chain, HTTP/socket RBAC, question receipts, approval revalidation and replay", async () => {
  // Metadata fixtures acquire only a disposable test asset reference, never real music.
  const asset = await db.models.Asset.create({
    storageKey: "test-only.wav",
    mimeType: "audio/wav",
    byteLength: 44,
    sha256: "phase-three-test",
    licenseLabel: "Original test fixture",
    sourceAttribution: "Integration test, no music",
  });
  await db.models.Track.updateMany(
    { demoMetadataOnly: true },
    { $set: { assetId: asset._id, durationSeconds: 200 } },
  );
  const { room } = await roomFor();
  const guest = await socketFor(users[1], room);
  await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[2]._id,
  });
  await command(room, users[0], "playback.control", { action: "start" });
  await app.rooms.writer.flush();
  const oldCheckpoint = await db.models.RoomSnapshot.findOne({
    loungeId: room.loungeId,
  }).lean();
  let state = await app.rooms.snapshot(room.loungeId);
  const http = (user, route, body, id = randomUUID()) =>
    request(app.app)
      .post(`/api/v1/lounges/${room.loungeId}${route}`)
      .set("Authorization", `Bearer ${user.token}`)
      .set("Origin", origin)
      .set("X-Command-Id", id)
      .send(body);
  expect(
    (await http(users[1], "/ai/segue", { expectedRevision: state.revision }))
      .status,
  ).toBe(403);
  expect(
    (
      await emit(guest, "lounge.command", {
        type: "ai.segue",
        commandId: randomUUID(),
        payload: { expectedRevision: state.revision },
      })
    ).error.code,
  ).toBe("FORBIDDEN");
  const qid = randomUUID(),
    body = { trackId: seedProfiles[0]._id, question: "What is the BPM tempo?" };
  const answer = await http(users[1], "/ai/questions", body, qid);
  expect(answer.status).toBe(200);
  expect(answer.body.answer).toContain("120");
  expect(answer.body.sourceEvents.length).toBeGreaterThan(0);
  const again = await http(users[1], "/ai/questions", body, qid);
  expect(again.body.answer).toBe(answer.body.answer);
  expect((await app.rooms.snapshot(room.loungeId)).questionCount).toBe(1);
  expect(
    (
      await http(users[1], "/ai/questions", {
        ...body,
        question: "Who won a Nobel prize?",
      })
    ).body.insufficientMetadata,
  ).toBe(true);
  expect((await http(users[2], "/ai/questions", body)).status).toBe(403);
  expect(
    (
      await http(users[1], "/ai/questions", {
        ...body,
        trackId: seedProfiles[2]._id,
      })
    ).status,
  ).toBe(422);
  let proposal = (await command(room, users[0], "ai.segue")).proposal;
  expect(proposal.selectedTrackId).toBe(seedProfiles[1]._id);
  expect(proposal.generationMode).toBe("template");
  expect((await app.rooms.snapshot(room.loungeId)).reservedEntryId).toBeNull();
  await command(room, users[1], "queue.vote", {
    entryId: proposal.entryId,
    upvoted: true,
  });
  await expect(
    command(room, users[0], "ai.decision", {
      proposalId: proposal.proposalId,
      decision: "approve",
    }),
  ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
  proposal = (await command(room, users[0], "ai.segue")).proposal;
  expect(
    (
      await http(users[1], `/ai/segue/${proposal.proposalId}/decision`, {
        expectedRevision: proposal.revision,
        decision: "approve",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await emit(guest, "lounge.command", {
        type: "ai.decision",
        commandId: randomUUID(),
        payload: {
          expectedRevision: proposal.revision,
          proposalId: proposal.proposalId,
          decision: "approve",
        },
      })
    ).error.code,
  ).toBe("FORBIDDEN");
  await db.models.Track.updateOne(
    { _id: proposal.selectedTrackId },
    { $inc: { profileVersion: 1 } },
  );
  await expect(
    command(room, users[0], "ai.decision", {
      proposalId: proposal.proposalId,
      decision: "approve",
    }),
  ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
  proposal = (await command(room, users[0], "ai.segue")).proposal;
  await command(room, users[0], "ai.decision", {
    proposalId: proposal.proposalId,
    decision: "reject",
  });
  expect((await app.rooms.snapshot(room.loungeId)).reservedEntryId).toBeNull();
  for (const target of [seedProfiles[1]._id, seedProfiles[2]._id]) {
    proposal = (await command(room, users[0], "ai.segue")).proposal;
    expect(proposal.selectedTrackId).toBe(target);
    await command(room, users[0], "ai.decision", {
      proposalId: proposal.proposalId,
      decision: "approve",
    });
    await command(room, users[0], "playback.control", { action: "advance" });
    expect((await app.rooms.snapshot(room.loungeId)).nowPlaying.trackId).toBe(
      target,
    );
  }
  proposal = (await command(room, users[0], "ai.segue")).proposal;
  expect(proposal.selectedTrackId).toBeNull();
  expect(proposal.reason).toBe("NO_COMPATIBLE_TRACK");
  state = await app.rooms.snapshot(room.loungeId);
  await app.rooms.writer.flush();
  await db.models.RoomSnapshot.updateOne(
    { loungeId: room.loungeId },
    { $set: { state: oldCheckpoint.state, revision: oldCheckpoint.revision } },
  );
  const recovered = new RoomService(db.models, db.connection, key);
  try {
    const restored = await recovered.snapshot(room.loungeId);
    expect(restored.nowPlaying.trackId).toBe(seedProfiles[2]._id);
    expect(restored.recentTrackIds).toEqual([
      seedProfiles[0]._id,
      seedProfiles[1]._id,
    ]);
    expect(restored.questionCount).toBe(2);
    expect(restored.segueProposal).toBeNull();
    expect(restored.epoch).not.toBe(state.epoch);
  } finally {
    await recovered.close();
  }
});

test("slow generation does not block votes; stale results and duplicate concurrent jobs are bounded", async () => {
  const { room } = await roomFor();
  await command(room, users[0], "playback.control", { action: "start" });
  const queued = await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  let release,
    calls = 0;
  app.rooms.aiProvider = async ({ context }) => {
    calls++;
    await new Promise((resolve) => {
      release = resolve;
    });
    return JSON.stringify({ sourceIds: [context[0].id] });
  };
  try {
    const state = await app.rooms.snapshot(room.loungeId),
      id = randomUUID();
    const job = app.rooms.command(
      room.loungeId,
      users[0].id,
      "ai.segue",
      { expectedRevision: state.revision },
      id,
    );
    const retry = app.rooms.command(
      room.loungeId,
      users[0].id,
      "ai.segue",
      { expectedRevision: state.revision },
      id,
    );
    const results = Promise.allSettled([job, retry]);
    await until(() => Boolean(release));
    await command(room, users[1], "queue.vote", {
      entryId: queued.entryId,
      upvoted: true,
    });
    release();
    expect(
      (await results).every(
        (r) => r.status === "rejected" && r.reason.code === "STALE_GENERATION",
      ),
    ).toBe(true);
    expect(calls).toBe(1);
    expect(app.rooms.aiJobs.size).toBe(0);
    app.rooms.aiProvider = () => new Promise(() => {});
    app.rooms.aiTimeoutMs = 20;
    expect(
      (await command(room, users[0], "ai.segue")).proposal.fallbackReason,
    ).toBe("MODEL_TIMEOUT");
  } finally {
    app.rooms.aiProvider = null;
    app.rooms.aiTimeoutMs = 2300;
    release?.();
  }
});

test("outro fires once, never auto-approves, and end of track pauses", async () => {
  const { room } = await roomFor();
  await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  await command(room, users[0], "playback.control", { action: "start" });
  const now = app.rooms.now;
  try {
    const start = app.rooms.states.get(room.loungeId).nowPlaying.startedAt;
    app.rooms.now = () => start + 191000;
    await app.rooms.tick();
    await until(() =>
      Boolean(app.rooms.states.get(room.loungeId).segueProposal),
    );
    const proposal = app.rooms.states.get(room.loungeId).segueProposal;
    await app.rooms.tick();
    expect(app.rooms.states.get(room.loungeId).segueProposal.proposalId).toBe(
      proposal.proposalId,
    );
    expect(app.rooms.states.get(room.loungeId).reservedEntryId).toBeNull();
    app.rooms.now = () => start + 201000;
    await app.rooms.tick();
    expect(app.rooms.states.get(room.loungeId).nowPlaying.paused).toBe(true);
  } finally {
    app.rooms.now = now;
  }
});
