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
import { summarize } from "../src/session-analytics.js";

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
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-phase5-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("phase_five_tests"));
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
    ...(![
      "queue.vote",
      "member.leave",
      "chat.message",
      "chat.reaction",
      "battle.candidate",
      "battle.vote",
      "interaction.record",
    ].includes(type)
      ? { expectedRevision: state.revision }
      : {}),
  });
}

test("bounded heartbeats, end barrier, replay summary and private dashboard", async () => {
  const { room, host } = await roomFor(2);
  const guest = await socketFor(users[1], room);
  let now = Math.floor(app.rooms.now());
  app.rooms.now = () => now;
  const track = await db.models.Track.findById(seedProfiles[0]._id);
  track.assetId = randomUUID();
  await track.save();
  await command(room, users[0], "playback.control", { action: "start" });
  const playbackId = (await app.rooms.snapshot(room.loungeId)).nowPlaying
    .playbackId;
  const heartbeat = (liked = false, id = randomUUID()) =>
    app.rooms.command(
      room.loungeId,
      users[1].id,
      "interaction.record",
      { playbackId, listenedThroughSeconds: 999999, liked },
      id,
    );
  await heartbeat();
  now += 10000;
  const id = randomUUID();
  expect((await heartbeat(true, id)).interaction.playedSeconds).toBeCloseTo(
    10,
    3,
  );
  expect((await heartbeat(true, id)).interaction.playedSeconds).toBeCloseTo(
    10,
    3,
  );
  expect((await heartbeat()).interaction.playedSeconds).toBeCloseTo(10, 3);
  await command(room, users[0], "playback.control", { action: "pause" });
  now += 20000;
  expect((await heartbeat()).interaction.playedSeconds).toBeCloseTo(10, 3);
  await command(room, users[0], "playback.control", { action: "resume" });
  now += 100000;
  expect((await heartbeat(true)).interaction.playedSeconds).toBeCloseTo(25, 3);
  const http = (user, path) =>
    request(app.app)
      .get(`/api/v1${path}`)
      .set("Authorization", `Bearer ${user.token}`);
  const before = await app.rooms.snapshot(room.loungeId);
  expect(
    (
      await request(app.app)
        .post(`/api/v1/lounges/${room.loungeId}/end`)
        .set("Authorization", `Bearer ${users[1].token}`)
        .set("Origin", origin)
        .send({ expectedRevision: before.revision })
    ).status,
  ).toBe(403);
  expect(
    (
      await emit(guest, "lounge.command", {
        type: "room.end",
        commandId: randomUUID(),
        payload: { expectedRevision: before.revision },
      })
    ).error.code,
  ).toBe("FORBIDDEN");
  await command(room, users[0], "room.end");
  expect(app.rooms.writer.buffer.length).toBe(0);
  const events = await db.models.QueueEvent.find({ loungeId: room.loungeId })
    .sort({ occurredAt: 1, revision: 1 })
    .lean();
  const summary = (await http(users[1], `/lounges/${room.loungeId}/analytics`))
    .body;
  expect(summary).toMatchObject(summarize(events));
  expect(summary.durationSeconds).toBe(130);
  expect(summary.peakParticipants).toBe(2);
  expect(summary.trackHistory).toHaveLength(1);
  expect(
    (await http(users[2], `/lounges/${room.loungeId}/analytics`)).status,
  ).toBe(403);
  expect(
    (await http(users[1], "/users/me/dashboard")).body.history[0].playedSeconds,
  ).toBeCloseTo(25, 3);
  expect(
    (await http(users[2], "/users/me/dashboard")).body.history,
  ).toHaveLength(0);
  await expect(
    command(room, users[0], "queue.enqueue", { trackId: seedProfiles[1]._id }),
  ).rejects.toMatchObject({ code: "ROOM_ENDED" });
  host.disconnect();
  guest.disconnect();
});
test("admin worker swaps model live with job RBAC and cold start", async () => {
  await db.models.User.updateOne(
    { _id: users[0].id },
    { $set: { isAdmin: true } },
  );
  const call = (user, path, method = "get", body) =>
    request(app.app)[method](`/api/v1${path}`)
      .set("Authorization", `Bearer ${user.token}`)
      .set("Origin", origin)
      .send(body);
  expect(
    (await call(users[1], "/admin/recommendation-jobs", "post", {})).status,
  ).toBe(403);
  const job = await call(users[0], "/admin/recommendation-jobs", "post", {});
  expect(job.status).toBe(202);
  await until(
    async () =>
      (await call(users[0], `/admin/recommendation-jobs/${job.body.jobId}`))
        .body.status === "complete",
  );
  expect(
    (await call(users[1], `/admin/recommendation-jobs/${job.body.jobId}`))
      .status,
  ).toBe(403);
  const rail = await call(users[1], "/users/me/recommendations");
  expect(rail.body.modelVersion).toMatch(/^hybrid-v1-/);
  expect(rail.body.items.some((r) => r.trackId === seedProfiles[0]._id)).toBe(
    false,
  );
  expect(
    (await call(users[2], "/users/me/recommendations")).body.fallbackReason,
  ).toBe("COLD_START");
  expect(
    (await call(users[2], "/users/me/recommendations?limit=999")).status,
  ).toBe(422);
});
