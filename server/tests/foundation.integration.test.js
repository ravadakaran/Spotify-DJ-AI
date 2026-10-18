import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import request from "supertest";
import { io } from "socket.io-client";
import { connect, migrate, seed, seedProfiles } from "../src/persistence.js";
import { createApplication } from "../src/app.js";
import { passwordOptions } from "../src/auth.js";

let repl, db, application, folder, baseUrl;
const origin = "http://127.0.0.1:5173";
const credentials = {};
const silent = { info() {}, error() {} };
const bearer = (name) => `Bearer ${credentials[name].accessToken}`;
const body = {
  seedTrackId: seedProfiles[0]._id,
  vibeProfile: "Integration lounge",
  maxParticipants: 2,
  bpmTolerancePct: 8,
  soundclashEnabled: true,
  aiVerbosity: "normal",
};
beforeAll(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-test-assets-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("foundation_tests"));
  await migrate(db.connection, db.models);
  await seed(db.models);
  application = createApplication({
    ...db,
    config: {
      key: randomBytes(48).toString("hex"),
      issuer: "tests",
      audience: "tests",
      origin,
      secure: false,
      assetRoot: folder,
    },
    logger: silent,
  });
  await new Promise((resolve) =>
    application.server.listen(0, "127.0.0.1", resolve),
  );
  baseUrl = `http://127.0.0.1:${application.server.address().port}`;
  for (const name of ["host", "listener", "outsider", "admin"]) {
    await db.models.User.create({
      emailNormalized: `${name}@example.test`,
      displayName: name,
      passwordHash: await argon2.hash("fixture-password-123", passwordOptions),
      isAdmin: name === "admin",
    });
    const res = await request(application.app)
      .post("/api/v1/auth/login")
      .send({ email: `${name}@example.test`, password: "fixture-password-123" })
      .expect(200);
    credentials[name] = {
      ...res.body,
      cookie: res.headers["set-cookie"][0].split(";")[0],
    };
  }
});
afterAll(async () => {
  await application?.close();
  await db?.connection.close();
  await repl?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});
test("migration and metadata seed rerun without overwriting edited profiles", async () => {
  await migrate(db.connection, db.models);
  await seed(db.models);
  expect(await db.models.Track.countDocuments()).toBe(3);
  expect(
    (await db.models.Track.findById(seedProfiles[0]._id)).demoMetadataOnly,
  ).toBe(true);
  await request(application.app).get("/api/v1/tracks").expect(401);
  const res = await request(application.app)
    .get("/api/v1/tracks?limit=2")
    .set("Authorization", bearer("host"))
    .expect(200);
  expect(res.body.items).toHaveLength(2);
  const page2 = await request(application.app)
    .get(`/api/v1/tracks?limit=2&cursor=${res.body.nextCursor}`)
    .set("Authorization", bearer("host"))
    .expect(200);
  expect(page2.body.items).toHaveLength(1);
});
test("register rejects privilege injection and duplicate identity", async () => {
  const data = {
    email: "new@example.test",
    displayName: "New",
    password: "example-password-123",
  };
  await request(application.app)
    .post("/api/v1/auth/register")
    .send({ ...data, isAdmin: true })
    .expect(422);
  await request(application.app)
    .post("/api/v1/auth/register")
    .send(data)
    .expect(201);
  await request(application.app)
    .post("/api/v1/auth/register")
    .send(data)
    .expect(409);
});
test("concurrent joins cannot overfill room; repeated join is idempotent", async () => {
  const created = await request(application.app)
    .post("/api/v1/lounges")
    .set("Authorization", bearer("host"))
    .send(body)
    .expect(201);
  const results = await Promise.all(
    ["listener", "outsider"].map((name) =>
      request(application.app)
        .post("/api/v1/lounges/join")
        .set("Authorization", bearer(name))
        .send({ inviteCode: created.body.inviteCode }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const winner = results[0].status === 200 ? "listener" : "outsider";
  const joined = await request(application.app)
    .post("/api/v1/lounges/join")
    .set("Authorization", bearer(winner))
    .send({ inviteCode: created.body.inviteCode })
    .expect(200);
  expect(joined.body.members).toHaveLength(2);
  expect(joined.body.revision).toBe(2);
  const stranger = winner === "listener" ? "outsider" : "listener";
  await request(application.app)
    .get(`/api/v1/lounges/${created.body.loungeId}`)
    .set("Authorization", bearer(stranger))
    .expect(403);
});
test("admin-only profile changes reject stale and invalid edits; all room roles enforced", async () => {
  const id = seedProfiles[0]._id;
  const update = {
    expectedProfileVersion: 1,
    acoustic: seedProfiles[0].acoustic,
    timeline: [],
  };
  await request(application.app)
    .put(`/api/v1/tracks/${id}/acoustic-profile`)
    .set("Authorization", bearer("host"))
    .send(update)
    .expect(403);
  await request(application.app)
    .put(`/api/v1/tracks/${id}/acoustic-profile`)
    .set("Authorization", bearer("admin"))
    .send({ ...update, acoustic: { ...update.acoustic, bpm: -2 } })
    .expect(422);
  await request(application.app)
    .put(`/api/v1/tracks/${id}/acoustic-profile`)
    .set("Authorization", bearer("admin"))
    .send(update)
    .expect(200);
  await request(application.app)
    .put(`/api/v1/tracks/${id}/acoustic-profile`)
    .set("Authorization", bearer("admin"))
    .send(update)
    .expect(409);
  const lounge = await application.rooms.create(credentials.host.user.id, {
    ...body,
    maxParticipants: 5,
  });
  await application.rooms.join(credentials.listener.user.id, {
    inviteCode: lounge.inviteCode,
  });
  await expect(
    application.rooms.member(lounge.loungeId, credentials.listener.user.id, [
      "host",
      "co_dj",
    ]),
  ).rejects.toMatchObject({ status: 403 });
  await db.models.Membership.updateOne(
    { loungeId: lounge.loungeId, userId: credentials.listener.user.id },
    { $set: { role: "co_dj" } },
  );
  expect(
    (
      await application.rooms.member(
        lounge.loungeId,
        credentials.listener.user.id,
        ["host", "co_dj"],
      )
    ).role,
  ).toBe("co_dj");
});
test("authenticated sockets receive matching snapshots and reject cross-room subscription", async () => {
  const lounge = await application.rooms.create(credentials.host.user.id, {
    ...body,
    maxParticipants: 5,
  });
  const sockets = [];
  async function socketFor(name) {
    const socket = io(`${baseUrl}/lounges`, {
      auth: { accessToken: credentials[name].accessToken },
      extraHeaders: { Origin: origin },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  }
  const subscribe = (socket) =>
    new Promise((resolve) =>
      socket.emit("lounge.subscribe", { loungeId: lounge.loungeId }, resolve),
    );
  try {
    const host = await socketFor("host");
    const listener = await socketFor("listener");
    expect((await subscribe(listener)).error.code).toBe("FORBIDDEN");
    expect((await subscribe(host)).ok).toBe(true);
    const hostUpdate = new Promise((resolve) =>
      host.once("lounge.state.snapshot", resolve),
    );
    await application.rooms.join(credentials.listener.user.id, {
      inviteCode: lounge.inviteCode,
    });
    const listenerUpdate = new Promise((resolve) =>
      listener.once("lounge.state.snapshot", resolve),
    );
    expect((await subscribe(listener)).ok).toBe(true);
    const [a, b] = await Promise.all([hostUpdate, listenerUpdate]);
    expect(a.payload).toEqual(b.payload);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
  }
});
test("refresh rejects foreign Origin, rotates, detects replay and revokes access", async () => {
  const cookie = credentials.outsider.cookie;
  await request(application.app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", cookie)
    .set("Origin", "https://attacker.invalid")
    .set("X-CSRF-Protection", "1")
    .expect(403);
  const refreshed = await request(application.app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", cookie)
    .set("Origin", origin)
    .set("X-CSRF-Protection", "1")
    .expect(200);
  expect(refreshed.headers["set-cookie"][0].split(";")[0]).not.toBe(cookie);
  await request(application.app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", cookie)
    .set("Origin", origin)
    .set("X-CSRF-Protection", "1")
    .expect(401);
  await request(application.app)
    .get("/api/v1/users/me")
    .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
    .expect(401);
});
test("media refuses executable uploads, requires auth and serves safe ranges", async () => {
  await request(application.app)
    .post("/api/v1/assets")
    .set("Authorization", bearer("admin"))
    .field("licenseLabel", "Test only")
    .field("sourceAttribution", "Fixture")
    .attach("file", Buffer.from("<script>bad()</script>"), "track.mp3")
    .expect(422);
  // Minimal valid PCM WAV fixture, used only to exercise file handling, not as music or seed audio.
  const wave = Buffer.alloc(1644);
  wave.write("RIFF");
  wave.writeUInt32LE(1636, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24);
  wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(1600, 40);
  const saved = await request(application.app)
    .post("/api/v1/assets")
    .set("Authorization", bearer("admin"))
    .field("licenseLabel", "Original test fixture")
    .field("sourceAttribution", "Generated silence for HTTP tests only")
    .attach("file", wave, "fixture.wav")
    .expect(201);
  await request(application.app)
    .get(`/api/v1/assets/${saved.body.assetId}/content`)
    .expect(401);
  const partial = await request(application.app)
    .get(`/api/v1/assets/${saved.body.assetId}/content`)
    .set("Authorization", bearer("host"))
    .set("Range", "bytes=0-9")
    .expect(206);
  expect(partial.headers["content-length"]).toBe("10");
  await request(application.app)
    .get(`/api/v1/assets/${saved.body.assetId}/content`)
    .set("Authorization", bearer("host"))
    .set("Range", "bytes=999999-")
    .expect(416);
});
