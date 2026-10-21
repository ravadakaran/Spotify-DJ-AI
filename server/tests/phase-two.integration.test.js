import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import { fork } from "node:child_process";
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
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-phase2-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("phase_two_tests"));
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

test("100 concurrent votes from 10 identities yield one deterministic state, with HTTP/socket RBAC and retry deduplication", async () => {
  const { room, host } = await roomFor(11);
  const entryA = await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  const entryB = await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[2]._id,
  });
  const peers = [];
  for (let i = 1; i <= 10; i++) peers.push(await socketFor(users[i], room));
  const before = await app.rooms.snapshot(room.loungeId);
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      emit(peers[i % 10], "lounge.command", {
        commandId: randomUUID(),
        type: "queue.vote",
        payload: { entryId: entryB.entryId, upvoted: true },
      }),
    ),
  );
  expect(results.every((r) => r.ok)).toBe(true);
  const state = await app.rooms.snapshot(room.loungeId);
  expect(state.revision).toBe(before.revision + 100);
  expect(state.nextUp.map((e) => e.entryId)).toEqual([
    entryB.entryId,
    entryA.entryId,
  ]);
  expect(state.nextUp[0].voteCount).toBe(10);
  for (const socket of [host, ...peers]) {
    const synced = await emit(socket, "lounge.resync", {
      loungeId: room.loungeId,
    });
    expect(synced.snapshot.nextUp).toEqual(state.nextUp);
    expect(synced.revision).toBe(state.revision);
  }
  const commandId = randomUUID(),
    payload = { entryId: entryA.entryId, upvoted: true };
  await app.rooms.command(
    room.loungeId,
    users[1].id,
    "queue.vote",
    payload,
    commandId,
  );
  const revision = (await app.rooms.snapshot(room.loungeId)).revision;
  await app.rooms.command(
    room.loungeId,
    users[1].id,
    "queue.vote",
    payload,
    commandId,
  );
  expect((await app.rooms.snapshot(room.loungeId)).revision).toBe(revision);
  await expect(
    app.rooms.command(
      room.loungeId,
      users[1].id,
      "queue.vote",
      { ...payload, upvoted: false },
      commandId,
    ),
  ).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  await request(app.app)
    .post(`/api/v1/lounges/${room.loungeId}/queue`)
    .set("Authorization", `Bearer ${users[1].token}`)
    .send({ trackId: seedProfiles[0]._id, expectedRevision: revision })
    .expect(403);
  const denied = await emit(peers[0], "lounge.command", {
    type: "queue.remove",
    commandId: randomUUID(),
    payload: { entryId: entryB.entryId, expectedRevision: revision },
  });
  expect(denied.error.code).toBe("FORBIDDEN");
  await expect(
    app.rooms.command(room.loungeId, users[11].id, "queue.vote", payload),
  ).rejects.toMatchObject({ status: 403 });
  await app.rooms.writer.flush();
  expect(
    await db.models.QueueEvent.countDocuments({
      loungeId: room.loungeId,
      type: "queue.vote",
    }),
  ).toBe(101);
  expect((await app.rooms.snapshot(room.loungeId)).durableRevision).toBe(
    revision,
  );
});

test("presence deduplicates tabs; last Host disconnect freezes immediately, participant grace and rejoin work", async () => {
  const { room, host } = await roomFor();
  const tab = await socketFor(users[0], room),
    guest = await socketFor(users[1], room);
  expect((await app.rooms.snapshot(room.loungeId)).participantCount).toBe(2);
  host.disconnect();
  await sleep(20);
  expect((await app.rooms.snapshot(room.loungeId)).mutationFrozen).toBe(false);
  tab.disconnect();
  await until(
    async () => (await app.rooms.snapshot(room.loungeId)).mutationFrozen,
  );
  await expect(
    command(room, users[0], "queue.enqueue", { trackId: seedProfiles[1]._id }),
  ).rejects.toMatchObject({ code: "HOST_DISCONNECTED" });
  await until(
    async () =>
      (await app.rooms.snapshot(room.loungeId)).participantCount === 1,
  );
  guest.disconnect();
  await until(
    async () =>
      (await app.rooms.snapshot(room.loungeId)).participantCount === 0,
  );
  await socketFor(users[0], room);
  expect((await app.rooms.snapshot(room.loungeId)).mutationFrozen).toBe(false);
});

test("host transfer, moderation, removal, leave, lock and invite rotation enforce current room authority", async () => {
  const { room, host } = await roomFor(3),
    guest = await socketFor(users[1], room);
  await command(room, users[0], "host.transfer", { userId: users[1].id });
  expect((await app.rooms.snapshot(room.loungeId)).hostUserId).toBe(
    users[1].id,
  );
  expect(
    (
      await db.models.Membership.findOne({
        loungeId: room.loungeId,
        userId: users[0].id,
      })
    ).role,
  ).toBe("co_dj");
  await expect(
    command(room, users[0], "member.update", {
      userId: users[2].id,
      muted: true,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await command(room, users[1], "member.update", {
    userId: users[2].id,
    muted: true,
  });
  expect(
    (await app.rooms.snapshot(room.loungeId)).members.find(
      (m) => m.userId === users[2].id,
    ).muted,
  ).toBe(true);
  await command(room, users[1], "room.settings", { locked: true });
  expect(() =>
    app.rooms.unmutedMember(app.rooms.states.get(room.loungeId), users[2].id),
  ).toThrow("muted");
  await expect(
    app.rooms.join(users[3].id, { inviteCode: room.inviteCode }),
  ).rejects.toMatchObject({ code: "ROOM_CLOSED" });
  await command(room, users[1], "room.settings", { locked: false });
  const invite = await command(room, users[1], "room.invite");
  await expect(
    app.rooms.join(users[3].id, { inviteCode: room.inviteCode }),
  ).rejects.toMatchObject({ code: "INVITE_NOT_FOUND" });
  await app.rooms.join(users[3].id, { inviteCode: invite.inviteCode });
  await command(room, users[1], "member.update", {
    userId: users[0].id,
    removed: true,
  });
  const rejected = await emit(host, "lounge.command", {
    type: "queue.vote",
    payload: { entryId: randomUUID(), upvoted: true },
    commandId: randomUUID(),
  });
  expect(rejected.error.code).toBe("FORBIDDEN");
  await expect(
    app.rooms.join(users[0].id, { inviteCode: invite.inviteCode }),
  ).rejects.toMatchObject({ status: 403 });
  await command(room, users[1], "member.leave");
  expect((await app.rooms.snapshot(room.loungeId)).mutationFrozen).toBe(true);
  expect(
    (await emit(guest, "lounge.resync", { loungeId: room.loungeId })).ok,
  ).toBe(true);
});

test("writer transaction failure degrades readiness, stops mutations and retries without duplicate events", async () => {
  const { room } = await roomFor();
  await app.rooms.writer.flush();
  await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  const connection = app.rooms.writer.connection;
  app.rooms.writer.connection = {
    transaction: async (callback) =>
      connection.transaction(async (session) => {
        await callback(session);
        throw new Error("Injected unavailable database");
      }),
  };
  try {
    await expect(app.rooms.writer.flush()).rejects.toThrow("Injected");
    await request(app.app).get("/api/v1/health/ready").expect(503);
    expect(
      await db.models.QueueEvent.countDocuments({
        loungeId: room.loungeId,
        type: "queue.enqueue",
      }),
    ).toBe(0);
    const buffered = app.rooms.writer.buffer.length;
    for (let i = 0; i < 10; i++)
      await expect(
        command(room, users[0], "queue.enqueue", {
          trackId: seedProfiles[2]._id,
        }),
      ).rejects.toMatchObject({ status: 503 });
    expect(app.rooms.writer.buffer.length).toBe(buffered);
  } finally {
    app.rooms.writer.connection = connection;
  }
  await app.rooms.writer.flush();
  await app.rooms.tick();
  await app.rooms.writer.flush();
  await request(app.app).get("/api/v1/health/ready").expect(200);
  expect(
    await db.models.QueueEvent.countDocuments({
      loungeId: room.loungeId,
      type: "queue.enqueue",
    }),
  ).toBe(1);
  await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[2]._id,
  });
  app.rooms.writer.connection = {
    transaction: async (callback) => {
      await connection.transaction(callback);
      throw new Error("Injected lost commit response");
    },
  };
  try {
    await expect(app.rooms.writer.flush()).rejects.toThrow(
      "lost commit response",
    );
    expect(
      await db.models.QueueEvent.countDocuments({
        loungeId: room.loungeId,
        type: "queue.enqueue",
      }),
    ).toBe(2);
  } finally {
    app.rooms.writer.connection = connection;
  }
  await app.rooms.writer.flush();
  await app.rooms.tick();
  await app.rooms.writer.flush();
  expect(
    await db.models.QueueEvent.countDocuments({
      loungeId: room.loungeId,
      type: "queue.enqueue",
    }),
  ).toBe(2);
});

test("one-second flush cadence persists a small batch without a manual flush", async () => {
  const { room } = await roomFor();
  const ack = await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  await until(
    async () =>
      (await app.rooms.snapshot(room.loungeId)).durableRevision >= ack.revision,
  );
  expect(
    await db.models.QueueEvent.countDocuments({
      loungeId: room.loungeId,
      type: "queue.enqueue",
    }),
  ).toBe(1);
});

test("crash recovery replays beyond an older checkpoint and discards unflushed commands with a new paused epoch", async () => {
  const room = await app.rooms.create(users[0].id, {
    seedTrackId: seedProfiles[0]._id,
    vibeProfile: "Recovery isolated",
    maxParticipants: 5,
    bpmTolerancePct: 8,
    soundclashEnabled: true,
    aiVerbosity: "normal",
  });
  // This room has not been served by sockets; retire its initial owner before recovery.
  app.rooms.states.delete(room.loungeId);
  app.rooms.durable.delete(room.loungeId);
  const first = new RoomService(db.models, db.connection, key, {
    intervalMs: 60000,
  });
  let second;
  try {
    await first.serial(room.loungeId, () =>
      first.attach(room.loungeId, users[0].id, "test-host"),
    );
    await first.writer.flush();
    const checkpoint = await db.models.RoomSnapshot.findOne({
      loungeId: room.loungeId,
    }).lean();
    const current = await first.snapshot(room.loungeId);
    const commandId = randomUUID(),
      body = {
        trackId: seedProfiles[1]._id,
        expectedRevision: current.revision,
      };
    await first.command(
      room.loungeId,
      users[0].id,
      "queue.enqueue",
      body,
      commandId,
    );
    await first.writer.flush();
    const durable = await first.snapshot(room.loungeId);
    await first.command(room.loungeId, users[0].id, "queue.enqueue", {
      trackId: seedProfiles[2]._id,
      expectedRevision: durable.revision,
    });
    await first.close({ flush: false });
    await db.models.RoomSnapshot.updateOne(
      { loungeId: room.loungeId },
      {
        $set: {
          epoch: checkpoint.epoch,
          revision: checkpoint.revision,
          state: checkpoint.state,
        },
      },
    );
    second = new RoomService(db.models, db.connection, key, {
      intervalMs: 60000,
    });
    const recovered = await second.snapshot(room.loungeId);
    expect(recovered.epoch).not.toBe(durable.epoch);
    expect(recovered.revision).toBe(durable.revision);
    expect(recovered.nextUp).toHaveLength(1);
    expect(recovered.mutationFrozen).toBe(true);
    expect(recovered.recovery.unflushedChangesMayBeLost).toBe(true);
    await second.command(
      room.loungeId,
      users[0].id,
      "queue.enqueue",
      body,
      commandId,
    );
    expect((await second.snapshot(room.loungeId)).nextUp).toHaveLength(1);
  } finally {
    await first.close({ flush: false });
    await second?.close();
  }
});

test("playback uses verified compatibility and monotonic pause/resume; unknown profiles cannot be promoted", async () => {
  const { room } = await roomFor();
  const asset = await db.models.Asset.create({
    storageKey: "test.wav",
    byteLength: 1,
    sha256: "fixture",
    mimeType: "audio/wav",
    licenseLabel: "Original test",
    sourceAttribution: "Test only",
  });
  await writeFile(path.join(folder, "test.wav"), "x");
  await db.models.Track.updateOne(
    { _id: seedProfiles[0]._id },
    { $set: { assetId: asset._id } },
  );
  await db.models.Track.updateOne(
    { _id: seedProfiles[1]._id },
    { $set: { assetId: asset._id } },
  );
  const pending = await db.models.Track.create({
    title: "Unknown",
    artist: "Test",
    durationSeconds: 30,
    assetId: asset._id,
    acoustic: null,
    profileStatus: "pending",
  });
  const entry = await command(room, users[0], "queue.enqueue", {
    trackId: pending._id,
  });
  await expect(
    command(room, users[0], "queue.promote", { entryId: entry.entryId }),
  ).rejects.toMatchObject({ code: "INCOMPATIBLE_TRACK" });
  await command(room, users[0], "playback.control", { action: "start" });
  await sleep(30);
  await command(room, users[0], "playback.control", { action: "pause" });
  let state = await app.rooms.snapshot(room.loungeId);
  expect(state.nowPlaying.paused).toBe(true);
  expect(state.nowPlaying.offsetSeconds).toBeGreaterThan(0);
  const next = await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[1]._id,
  });
  await command(room, users[0], "queue.promote", { entryId: next.entryId });
  await command(room, users[0], "playback.control", { action: "advance" });
  state = await app.rooms.snapshot(room.loungeId);
  expect(state.nowPlaying.trackId).toBe(seedProfiles[1]._id);
  expect(state.nowPlaying.paused).toBe(false);
  // Profile changes are rechecked at execution time, even after reservation.
  const same = await command(room, users[0], "queue.enqueue", {
    trackId: seedProfiles[0]._id,
  });
  await command(room, users[0], "queue.promote", { entryId: same.entryId });
  await db.models.Track.updateOne(
    { _id: seedProfiles[0]._id },
    { $set: { "acoustic.camelotKey": "3A" } },
  );
  await expect(
    command(room, users[0], "playback.control", { action: "advance" }),
  ).rejects.toMatchObject({ code: "INCOMPATIBLE_TRACK" });
});

test("killed Node process loses only unflushed changes and a fresh process restores paused playback", async () => {
  const room = await app.rooms.create(users[0].id, {
    seedTrackId: seedProfiles[1]._id,
    vibeProfile: "Killed process test",
    maxParticipants: 5,
    bpmTolerancePct: 8,
    soundclashEnabled: true,
    aiVerbosity: "normal",
  });
  app.rooms.states.delete(room.loungeId);
  app.rooms.durable.delete(room.loungeId);
  const children = [];
  const waitMessage = (child) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Worker timeout"));
      }, 10000);
      const cleanup = () => {
        clearTimeout(timer);
        child.off("message", receive);
        child.off("exit", exited);
      };
      const receive = (message) => {
        cleanup();
        message.error ? reject(new Error(message.error)) : resolve(message);
      };
      const exited = (code) => {
        cleanup();
        reject(new Error(`Worker exited ${code}`));
      };
      child.once("message", receive);
      child.once("exit", exited);
    });
  const start = async () => {
    const child = fork(
      new URL("./fixtures/crash-room.js", import.meta.url),
      [],
      {
        env: { ...process.env, PHASE_TEST_URI: repl.getUri("phase_two_tests") },
        execArgv: [],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
        windowsHide: true,
      },
    );
    children.push(child);
    await waitMessage(child);
    return child;
  };
  const kill = (child) =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null)
        return resolve();
      child.once("exit", resolve);
      child.kill("SIGKILL");
    });
  try {
    const first = await start();
    const prepared = waitMessage(first);
    first.send({
      action: "prepare",
      roomId: room.loungeId,
      userId: users[0].id,
    });
    const { durable, live } = await prepared;
    expect(live.nextUp).toHaveLength(2);
    expect(durable.nextUp).toHaveLength(1);
    await kill(first);
    const second = await start();
    const restored = waitMessage(second);
    second.send({
      action: "restore",
      roomId: room.loungeId,
      userId: users[0].id,
    });
    const { recovered } = await restored;
    expect(recovered.epoch).not.toBe(durable.epoch);
    expect(recovered.revision).toBe(durable.revision);
    expect(recovered.nextUp).toHaveLength(1);
    expect(recovered.nowPlaying.paused).toBe(true);
    expect(recovered.recovery.requiresHostResume).toBe(true);
    expect(recovered.participantCount).toBe(0);
  } finally {
    await Promise.all(children.map(kill));
  }
});
