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
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-phase4-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("phase_four_tests"));
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
    ].includes(type)
      ? { expectedRevision: state.revision }
      : {}),
  });
}

test("chat HTTP/socket guards, limits, typing expiry, transactional history and older-checkpoint replay", async () => {
  const { room } = await roomFor(3),
    guest = await socketFor(users[1], room);
  const http = (user, route, body, method = "post", id = randomUUID()) =>
    request(app.app)[method](`/api/v1/lounges/${room.loungeId}${route}`)
      .set("Authorization", `Bearer ${user.token}`)
      .set("Origin", origin)
      .set("X-Command-Id", id)
      .send(body);
  const socketCommand = (type, payload) =>
    emit(guest, "lounge.command", { type, payload, commandId: randomUUID() });
  await app.rooms.writer.flush();
  const checkpoint = await db.models.RoomSnapshot.findOne({
    loungeId: room.loungeId,
  }).lean();
  const id = randomUUID(),
    text = "I really love this track <script>alert(1)</script>";
  const sent = await http(users[1], "/chat", { body: text }, "post", id);
  expect(sent.status).toBe(201);
  expect(
    (await http(users[1], "/chat", { body: text }, "post", id)).body.messageId,
  ).toBe(sent.body.messageId);
  expect(
    (await http(users[1], "/chat", { body: "changed" }, "post", id)).status,
  ).toBe(409);
  expect((await http(users[3], "/chat", { body: "outsider" })).status).toBe(
    403,
  );
  expect(
    (await http(users[1], "/chat", { body: "x".repeat(1001) })).status,
  ).toBe(422);
  expect(
    (
      await http(
        users[1],
        `/chat/${sent.body.messageId}/reactions`,
        { emoji: "🔥", active: true },
        "put",
      )
    ).status,
  ).toBe(200);
  await command(room, users[0], "member.update", {
    userId: users[1].id,
    muted: true,
  });
  expect((await http(users[1], "/chat", { body: "muted" })).status).toBe(403);
  expect(
    (await socketCommand("chat.message", { body: "muted" })).error.code,
  ).toBe("MEMBER_MUTED");
  expect(
    (
      await socketCommand("chat.reaction", {
        messageId: sent.body.messageId,
        emoji: "🔥",
        active: false,
      })
    ).error.code,
  ).toBe("MEMBER_MUTED");
  expect(
    (
      await http(
        users[1],
        `/chat/${sent.body.messageId}/reactions`,
        { emoji: "🔥", active: false },
        "put",
      )
    ).status,
  ).toBe(403);
  expect(
    (await emit(guest, "lounge.chat.typing", { active: true })).error.code,
  ).toBe("MEMBER_MUTED");
  await command(room, users[0], "member.update", {
    userId: users[1].id,
    muted: false,
  });
  const originalNow = app.rooms.now;
  let now = originalNow();
  app.rooms.now = () => now;
  try {
    expect((await emit(guest, "lounge.chat.typing", { active: true })).ok).toBe(
      true,
    );
    expect(app.rooms.typing.size).toBeGreaterThan(0);
    now += 3100;
    await app.rooms.tick();
    expect(app.rooms.typing.size).toBe(0);
    expect(
      (await app.rooms.snapshot(room.loungeId)).sentiment.rollingScore,
    ).toBeGreaterThan(0);
    now += 31000;
    await app.rooms.tick();
    expect((await app.rooms.snapshot(room.loungeId)).sentiment.sampleSize).toBe(
      0,
    );
    for (let i = 0; i < 5; i++)
      await command(room, users[1], "chat.message", {
        body: "This is awful and boring",
      });
    await expect(
      command(room, users[1], "chat.message", { body: "too fast" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    now += 1100;
    await app.rooms.tick();
    expect((await app.rooms.snapshot(room.loungeId)).sentiment).toMatchObject({
      sampleSize: 1,
    });
    expect(
      (await app.rooms.snapshot(room.loungeId)).sentiment.rollingScore,
    ).toBeLessThan(0);
  } finally {
    app.rooms.now = originalNow;
  }
  await app.rooms.writer.flush();
  const page = await app.rooms.chatHistory(room.loungeId, users[1].id);
  expect(page.items).toHaveLength(6);
  expect(page.items[0].body).toBe(text);
  expect(page.items[0].reactions["🔥"]).toEqual([users[1].id]);
  expect(
    await db.models.QueueEvent.countDocuments({
      loungeId: room.loungeId,
      type: /typing/,
    }),
  ).toBe(0);
  const before = await app.rooms.snapshot(room.loungeId);
  await db.models.RoomSnapshot.updateOne(
    { loungeId: room.loungeId },
    { $set: { state: checkpoint.state, revision: checkpoint.revision } },
  );
  const recovered = new RoomService(db.models, db.connection, key);
  try {
    const state = await recovered.snapshot(room.loungeId);
    expect(state.chat).toEqual(before.chat);
    expect(state.sentiment).toEqual(before.sentiment);
    expect(state.epoch).not.toBe(before.epoch);
  } finally {
    await recovered.close();
  }
  await command(room, users[0], "member.update", {
    userId: users[1].id,
    removed: true,
  });
  expect((await http(users[1], "/chat", undefined, "get")).status).toBe(403);
  expect((await socketCommand("chat.message", { body: "removed" })).ok).toBe(
    false,
  );
});

test("battle roles, four candidates, concurrent votes/close, one effect, compatibility recheck and replay", async () => {
  const asset = await db.models.Asset.create({
    storageKey: "test-only.wav",
    mimeType: "audio/wav",
    byteLength: 44,
    sha256: randomUUID(),
    licenseLabel: "Original test fixture",
    sourceAttribution: "No music",
  });
  await db.models.Track.updateMany(
    { demoMetadataOnly: true },
    { $set: { assetId: asset._id } },
  );
  const extra = await db.models.Track.create({
    ...seedProfiles[0],
    _id: randomUUID(),
    title: "Fourth fixture",
    assetId: asset._id,
  });
  const { room } = await roomFor(4),
    guest = await socketFor(users[1], room);
  const candidates = [];
  for (let i = 0; i < 4; i++)
    candidates.push(
      await command(room, users[i], "battle.candidate", {
        trackId: i === 3 ? extra._id : seedProfiles[i]._id,
      }),
    );
  const battleId = candidates[0].battleId;
  await expect(
    command(room, users[1], "battle.candidate", { trackId: extra._id }),
  ).rejects.toMatchObject({ code: "CANDIDATE_LIMIT" });
  const opening = {
    battleId,
    durationSeconds: 10,
    expectedRevision: (await app.rooms.snapshot(room.loungeId)).revision,
  };
  expect(
    (
      await emit(guest, "lounge.command", {
        type: "battle.open",
        commandId: randomUUID(),
        payload: opening,
      })
    ).error.code,
  ).toBe("FORBIDDEN");
  expect(
    (
      await request(app.app)
        .post(`/api/v1/lounges/${room.loungeId}/battles/${battleId}/open`)
        .set("Authorization", `Bearer ${users[1].token}`)
        .set("Origin", origin)
        .send({
          durationSeconds: 10,
          expectedRevision: opening.expectedRevision,
        })
    ).status,
  ).toBe(403);
  await command(room, users[0], "battle.open", {
    battleId,
    durationSeconds: 10,
  });
  await expect(
    command(room, users[0], "battle.open", { battleId, durationSeconds: 10 }),
  ).rejects.toMatchObject({ code: "BATTLE_NOT_READY" });
  await app.rooms.writer.flush();
  const checkpoint = await db.models.RoomSnapshot.findOne({
    loungeId: room.loungeId,
  }).lean();
  await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      command(room, users[i % 4], "battle.vote", {
        battleId,
        candidateId: candidates[1].candidateId,
      }),
    ),
  );
  expect(
    Object.keys((await app.rooms.snapshot(room.loungeId)).battle.votes),
  ).toHaveLength(4);
  const oldNow = app.rooms.now;
  app.rooms.now = () => checkpoint.state.battle.closesAt;
  try {
    const outcomes = await Promise.allSettled([
      app.rooms.tick(),
      command(room, users[1], "battle.vote", {
        battleId,
        candidateId: candidates[0].candidateId,
      }),
      app.rooms.tick(),
    ]);
    expect(outcomes[1].status).toBe("rejected");
    const state = await app.rooms.snapshot(room.loungeId);
    expect(state.battle).toMatchObject({
      status: "resolved",
      applicationStatus: "reserved",
      winningTrackId: seedProfiles[1]._id,
    });
    expect(state.nextUp).toHaveLength(1);
    expect(state.chat).toHaveLength(1);
    expect(state.battleCount).toBe(1);
    await expect(
      command(room, users[0], "battle.resolve", { battleId }),
    ).rejects.toMatchObject({ code: "BATTLE_NOT_DUE" });
    await db.models.Track.updateOne(
      { _id: seedProfiles[1]._id },
      { $set: { "acoustic.camelotKey": "3A" }, $inc: { profileVersion: 1 } },
    );
    await expect(
      command(room, users[0], "playback.control", { action: "advance" }),
    ).rejects.toMatchObject({ code: "INCOMPATIBLE_TRACK" });
    await app.rooms.writer.flush();
    expect(
      await db.models.QueueEvent.countDocuments({
        loungeId: room.loungeId,
        type: "battle.resolved",
      }),
    ).toBe(1);
    await db.models.RoomSnapshot.updateOne(
      { loungeId: room.loungeId },
      { $set: { state: checkpoint.state, revision: checkpoint.revision } },
    );
    const recovered = new RoomService(db.models, db.connection, key);
    try {
      const replay = await recovered.snapshot(room.loungeId);
      expect(replay.battle).toEqual(state.battle);
      expect(replay.nextUp).toEqual(state.nextUp);
      expect(replay.chat).toEqual(state.chat);
    } finally {
      await recovered.close();
    }
  } finally {
    app.rooms.now = oldNow;
    await db.models.Track.updateOne(
      { _id: seedProfiles[1]._id },
      { $set: { "acoustic.camelotKey": "9A" } },
    );
  }
});

test("paged history, old-message reactions, duplicate batch retry and schema checks", async () => {
  const { room } = await roomFor(12);
  await app.rooms.writer.flush();
  const ids = [];
  for (let i = 0; i < 55; i++)
    ids.push(
      (
        await command(room, users[i % 12], "chat.message", {
          body: `History ${i}`,
        })
      ).messageId,
    );
  await app.rooms.writer.flush();
  expect((await app.rooms.snapshot(room.loungeId)).chat).toHaveLength(50);
  const page = await app.rooms.chatHistory(room.loungeId, users[0].id);
  expect(page.items).toHaveLength(50);
  expect(page.nextCursor).toBe(ids[5]);
  const older = await app.rooms.chatHistory(
    room.loungeId,
    users[0].id,
    page.nextCursor,
  );
  expect(older.items.map((m) => m.messageId)).toEqual(ids.slice(0, 5));
  expect(older.nextCursor).toBeNull();
  await command(room, users[0], "chat.reaction", {
    messageId: ids[0],
    emoji: "👍",
    active: true,
  });
  await command(room, users[1], "chat.reaction", {
    messageId: ids[0],
    emoji: "👍",
    active: true,
  });
  const connection = app.rooms.writer.connection;
  app.rooms.writer.connection = {
    transaction: async (callback) => {
      await connection.transaction(callback);
      throw new Error("lost social commit response");
    },
  };
  try {
    await expect(app.rooms.writer.flush()).rejects.toThrow(
      "lost social commit response",
    );
  } finally {
    app.rooms.writer.connection = connection;
  }
  await app.rooms.writer.flush();
  await app.rooms.tick();
  await app.rooms.writer.flush();
  expect(
    (
      await db.models.ChatMessage.findOne({ messageId: ids[0] }).lean()
    ).reactions["👍"].sort(),
  ).toEqual([users[0].id, users[1].id].sort());
  expect(
    await db.models.ChatMessage.countDocuments({ loungeId: room.loungeId }),
  ).toBe(55);
  await expect(
    app.rooms.chatHistory(room.loungeId, users[0].id, randomUUID()),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  await expect(
    db.connection
      .collection("chat_messages")
      .insertOne({
        loungeId: room.loungeId,
        messageId: randomUUID(),
        body: "x".repeat(1001),
        msgType: "chat",
        revision: 1,
      }),
  ).rejects.toMatchObject({ code: 121 });
});

test("internal DJ opens a submitted draft once at outro; disabled rooms reject candidates", async () => {
  const { room } = await roomFor();
  await command(room, users[0], "room.settings", { soundclashEnabled: false });
  await expect(
    command(room, users[1], "battle.candidate", {
      trackId: seedProfiles[1]._id,
    }),
  ).rejects.toMatchObject({ code: "BATTLES_DISABLED" });
  await command(room, users[0], "room.settings", { soundclashEnabled: true });
  await command(room, users[0], "battle.candidate", {
    trackId: seedProfiles[0]._id,
  });
  await command(room, users[1], "battle.candidate", {
    trackId: seedProfiles[1]._id,
  });
  await command(room, users[0], "playback.control", { action: "start" });
  const oldNow = app.rooms.now,
    p = (await app.rooms.snapshot(room.loungeId)).nowPlaying;
  app.rooms.now = () => p.startedAt + (p.durationSeconds - 9) * 1000;
  try {
    await app.rooms.tick();
    await app.rooms.tick();
    expect((await app.rooms.snapshot(room.loungeId)).battle.status).toBe(
      "open",
    );
    expect((await app.rooms.snapshot(room.loungeId)).battleCount).toBe(1);
  } finally {
    app.rooms.now = oldNow;
  }
});

test("zero-vote and voted ties require a leader; incompatible winner deferred; Host loss freezes resolution", async () => {
  const { room, host } = await roomFor();
  const a = await command(room, users[0], "battle.candidate", {
    trackId: seedProfiles[0]._id,
  });
  const b = await command(room, users[1], "battle.candidate", {
    trackId: seedProfiles[2]._id,
  });
  await command(room, users[0], "battle.open", {
    battleId: a.battleId,
    durationSeconds: 10,
  });
  const oldNow = app.rooms.now,
    deadline = (await app.rooms.snapshot(room.loungeId)).battle.closesAt;
  app.rooms.now = () => deadline;
  try {
    host.disconnect();
    await until(() => !app.rooms.hasSockets(room.loungeId, users[0].id));
    await app.rooms.tick();
    expect((await app.rooms.snapshot(room.loungeId)).battle.status).toBe(
      "open",
    );
    await expect(
      command(room, users[0], "battle.resolve", { battleId: a.battleId }),
    ).rejects.toMatchObject({ code: "HOST_DISCONNECTED" });
    await socketFor(users[0], room);
    await app.rooms.tick();
    expect((await app.rooms.snapshot(room.loungeId)).battle.status).toBe(
      "awaiting_tie",
    );
    await command(room, users[0], "member.update", {
      userId: users[1].id,
      role: "co_dj",
    });
    await command(room, users[1], "battle.resolve", {
      battleId: a.battleId,
      winnerCandidateId: b.candidateId,
    });
    const state = await app.rooms.snapshot(room.loungeId);
    expect(state.battle.applicationStatus).toBe("deferred");
    expect(state.reservedEntryId).toBeNull();
    expect(state.nextUp[0].trackId).toBe(seedProfiles[2]._id);
    expect(state.chat[0].body).toContain("deferred");
    const next = await command(room, users[0], "battle.candidate", {
      trackId: seedProfiles[0]._id,
    });
    const other = await command(room, users[1], "battle.candidate", {
      trackId: seedProfiles[1]._id,
    });
    await command(room, users[0], "battle.open", {
      battleId: next.battleId,
      durationSeconds: 10,
    });
    await command(room, users[0], "battle.vote", {
      battleId: next.battleId,
      candidateId: next.candidateId,
    });
    await command(room, users[1], "battle.vote", {
      battleId: next.battleId,
      candidateId: other.candidateId,
    });
    app.rooms.now = () => deadline + 10000;
    await app.rooms.tick();
    expect((await app.rooms.snapshot(room.loungeId)).battle.status).toBe(
      "awaiting_tie",
    );
    await expect(
      command(room, users[0], "battle.resolve", {
        battleId: next.battleId,
        winnerCandidateId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_WINNER" });
    await command(room, users[0], "battle.cancel", { battleId: next.battleId });
    expect((await app.rooms.snapshot(room.loungeId)).battle.status).toBe(
      "cancelled",
    );
  } finally {
    app.rooms.now = oldNow;
  }
});
