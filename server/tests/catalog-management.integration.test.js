import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { connect, migrate } from "../src/persistence.js";
import { createApplication } from "../src/app.js";

let repl, db, application, folder;
const tokens = {};
const acoustic = { bpm: 120, camelotKey: "8A", energy: 0.5, valence: 0.5 };
function api(method, route, role = "admin") {
  const client = request(application.app);
  return client[method](`/api/v1${route}`).set(
    "Authorization",
    `Bearer ${tokens[role]}`,
  );
}
function wave(seconds = 0.1) {
  const bytes = Math.round(16000 * seconds);
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF");
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}
async function upload(seconds = 0.1) {
  return (
    await api("post", "/assets")
      .field("licenseLabel", "Original test silence")
      .field("sourceAttribution", "Generated disposable test fixture")
      .attach("file", wave(seconds), "fixture.wav")
      .expect(201)
  ).body;
}
async function track(asset = null) {
  asset ||= await upload();
  return (
    await api("post", "/tracks")
      .send({
        title: "Editable fixture",
        artist: "Test",
        assetId: asset.assetId,
        durationSeconds: asset.durationSeconds,
        acoustic,
        timeline: [],
      })
      .expect(201)
  ).body;
}
function edit(t, overrides = {}) {
  return {
    title: t.title,
    artist: t.artist,
    acoustic: t.acoustic,
    timeline: t.timeline,
    assetId: t.assetId,
    expectedProfileVersion: t.profileVersion,
    ...overrides,
  };
}
beforeAll(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-catalog-tests-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("catalog_management_tests"));
  await migrate(db.connection, db.models);
  application = createApplication({
    ...db,
    config: {
      key: randomBytes(48).toString("hex"),
      issuer: "tests",
      audience: "tests",
      origin: "http://localhost:5173",
      secure: false,
      assetRoot: folder,
    },
    logger: { info() {}, error() {} },
  });
  for (const role of ["admin", "listener"]) {
    await request(application.app)
      .post("/api/v1/auth/register")
      .send({
        email: `${role}@example.test`,
        displayName: role,
        password: "catalog-fixture-password",
      })
      .expect(201);
    if (role === "admin")
      await db.models.User.updateOne(
        { emailNormalized: `${role}@example.test` },
        { $set: { isAdmin: true } },
      );
    tokens[role] = (
      await request(application.app)
        .post("/api/v1/auth/login")
        .send({
          email: `${role}@example.test`,
          password: "catalog-fixture-password",
        })
        .expect(200)
    ).body.accessToken;
  }
});
afterAll(async () => {
  await application?.close();
  await db?.connection.close();
  await repl?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});

test("catalog mutations enforce auth, strict validation and optimistic versions", async () => {
  const t = await track();
  await request(application.app)
    .delete(`/api/v1/tracks/${t.trackId}`)
    .send({ expectedProfileVersion: 1 })
    .expect(401);
  await api("put", `/tracks/${t.trackId}`, "listener")
    .send(edit(t))
    .expect(403);
  await api("delete", `/tracks/${t.trackId}`, "listener")
    .send({ expectedProfileVersion: 1 })
    .expect(403);
  await api("put", `/tracks/${t.trackId}`)
    .send(edit(t, { acoustic: { ...acoustic, bpm: -1 } }))
    .expect(422);
  await api("delete", `/tracks/${t.trackId}`).send({}).expect(422);
  const changed = (
    await api("put", `/tracks/${t.trackId}`)
      .send(edit(t, { title: "Renamed", artist: "Updated" }))
      .expect(200)
  ).body;
  expect(changed).toMatchObject({
    title: "Renamed",
    artist: "Updated",
    profileVersion: 2,
  });
  await api("put", `/tracks/${t.trackId}`).send(edit(t)).expect(409);
  await api("delete", `/tracks/${t.trackId}`)
    .send({ expectedProfileVersion: 1 })
    .expect(409);
  expect(await db.models.Track.exists({ _id: t.trackId })).toBeTruthy();
});

test("replacement measures duration, clears timeline and removes unshared original media", async () => {
  const t = await track();
  const original = await db.models.Asset.findById(t.assetId);
  const replacement = await upload(0.2);
  await api("put", `/tracks/${t.trackId}`)
    .send(
      edit(t, {
        assetId: replacement.assetId,
        timeline: [
          {
            id: randomUUID(),
            ts: 0,
            type: "trivia",
            text: "Old recording",
            sourceLabel: "Authored test",
          },
        ],
      }),
    )
    .expect(422);
  expect(await readFile(path.join(folder, original.storageKey))).toEqual(
    wave(),
  );
  const result = (
    await api("put", `/tracks/${t.trackId}`)
      .send(edit(t, { assetId: replacement.assetId }))
      .expect(200)
  ).body;
  expect(result).toMatchObject({
    durationSeconds: 0.2,
    assetId: replacement.assetId,
    assetCleanup: "removed",
    timeline: [],
    profileVersion: 2,
  });
  await expect(
    readFile(path.join(folder, original.storageKey)),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await api("get", `/assets/${t.assetId}/content`).expect(404);
  await api("get", `/assets/${replacement.assetId}/content`).expect(200);
});

test("deletion preserves shared audio until its final track is removed", async () => {
  const asset = await upload(),
    a = await track(asset),
    b = await track(asset);
  const first = await api("delete", `/tracks/${a.trackId}`)
    .send({ expectedProfileVersion: 1 })
    .expect(200);
  expect(first.body.assetCleanup).toBe("shared");
  await api("get", `/assets/${asset.assetId}/content`).expect(200);
  const last = await api("delete", `/tracks/${b.trackId}`)
    .send({ expectedProfileVersion: 1 })
    .expect(200);
  expect(last.body.assetCleanup).toBe("removed");
  await api("get", `/assets/${asset.assetId}/content`).expect(404);
  expect(
    (await api("get", "/tracks?limit=100")).body.items.some(
      (t) => t.trackId === a.trackId || t.trackId === b.trackId,
    ),
  ).toBe(false);
});

test("invalid replacement preserves the original track, version and media", async () => {
  const t = await track();
  await api("put", `/tracks/${t.trackId}`)
    .send(edit(t, { assetId: randomUUID() }))
    .expect(422);
  await api("put", `/tracks/${t.trackId}`)
    .send(edit(t, { assetId: null }))
    .expect(422);
  const missing = await db.models.Asset.create({
    storageKey: `${randomUUID()}.wav`,
    byteLength: 12,
    sha256: "test",
    licenseLabel: "Test",
    sourceAttribution: "Missing-file fixture",
  });
  await api("put", `/tracks/${t.trackId}`)
    .send(edit(t, { assetId: missing._id }))
    .expect(422);
  expect(await db.models.Track.findById(t.trackId)).toMatchObject({
    assetId: t.assetId,
    profileVersion: 1,
  });
  await api("get", `/assets/${t.assetId}/content`).expect(200);
});

test("concurrent edits have one winner and create/delete cannot leave a live missing seed", async () => {
  const t = await track();
  const edits = await Promise.all(
    ["One", "Two"].map((title) =>
      api("put", `/tracks/${t.trackId}`).send(edit(t, { title })),
    ),
  );
  expect(edits.map((r) => r.status).sort()).toEqual([200, 409]);
  const results = await Promise.all([
    api("post", "/lounges").send({
      seedTrackId: t.trackId,
      vibeProfile: "Race test",
    }),
    api("delete", `/tracks/${t.trackId}`).send({ expectedProfileVersion: 2 }),
  ]);
  if (results[0].status === 201) {
    expect(results[1].status).toBe(409);
    expect(await db.models.Track.exists({ _id: t.trackId })).toBeTruthy();
    await api("put", `/tracks/${t.trackId}`)
      .send(edit(t, { expectedProfileVersion: 2 }))
      .expect(409);
    // End through the real command path; preserve historical documents.
    const state = await application.rooms.snapshot(results[0].body.loungeId);
    await application.rooms.command(
      state.loungeId,
      state.hostUserId,
      "room.end",
      { expectedRevision: state.revision },
      randomUUID(),
    );
    await api("delete", `/tracks/${t.trackId}`)
      .send({ expectedProfileVersion: 2 })
      .expect(200);
    expect(
      await db.models.Lounge.exists({ _id: state.loungeId, status: "ended" }),
    ).toBeTruthy();
  } else {
    expect(results[0].status).toBe(422);
    expect(results[1].status).toBe(200);
  }
});

test("cleanup rejects escaped paths and retains a recoverable asset record", async () => {
  const asset = await db.models.Asset.create({
    storageKey: "../outside.wav",
    byteLength: 1,
    sha256: "test",
    licenseLabel: "Test",
    sourceAttribution: "Test",
  });
  const t = await track({ assetId: asset._id, durationSeconds: 0.1 });
  // Missing files are safe to forget; an existing external target must never be unlinked.
  const { writeFile } = await import("node:fs/promises");
  const outside = path.join(
    path.dirname(folder),
    `${path.basename(folder)}-outside.wav`,
  );
  await writeFile(outside, wave());
  await db.models.Asset.updateOne(
    { _id: asset._id },
    { $set: { storageKey: `../${path.basename(outside)}` } },
  );
  try {
    const result = await api("delete", `/tracks/${t.trackId}`)
      .send({ expectedProfileVersion: 1 })
      .expect(200);
    expect(result.body.assetCleanup).toBe("retained");
    expect(await readFile(outside)).toEqual(wave());
    expect(await db.models.Asset.exists({ _id: asset._id })).toBeTruthy();
  } finally {
    await rm(outside, { force: true });
  }
});

test("title/artist search reaches beyond 100 tracks and composes with cursor pagination", async () => {
  const fixtures = await db.models.Track.insertMany(
    Array.from({ length: 121 }, (_, i) => ({
      title: `Paged search ${i}`,
      artist: "Full library artist [literal]",
      durationSeconds: 1,
      profileStatus: "pending",
      acoustic: null,
    })),
  );
  try {
    const first = (
      await api(
        "get",
        "/tracks?q=Full%20library%20artist%20%5Bliteral%5D&limit=100",
        "listener",
      ).expect(200)
    ).body;
    expect(first.items).toHaveLength(100);
    const second = (
      await api(
        "get",
        `/tracks?q=Full%20library%20artist%20%5Bliteral%5D&limit=100&cursor=${encodeURIComponent(first.nextCursor)}`,
        "listener",
      ).expect(200)
    ).body;
    expect(second.items).toHaveLength(21);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((t) => t.trackId)).size,
    ).toBe(121);
    expect(
      (
        await api("get", "/tracks?q=Paged%20search%20120", "listener").expect(
          200,
        )
      ).body.items,
    ).toHaveLength(1);
  } finally {
    await db.models.Track.deleteMany({
      _id: { $in: fixtures.map((t) => t._id) },
    });
  }
});

test("administrator-authored timeline objects survive create, read and edit for grounded citations", async () => {
  const asset = await upload();
  const timeline = [
    {
      id: "725a4361-fba4-472b-b8f7-a86d3e486a21",
      ts: 0,
      type: "trivia",
      text: "Original author-provided context.",
      sourceLabel: "Original source revision 1",
    },
  ];
  const created = (
    await api("post", "/tracks")
      .send({
        title: "Grounded timeline fixture",
        artist: "Original fixture",
        assetId: asset.assetId,
        durationSeconds: asset.durationSeconds,
        acoustic,
        timeline,
      })
      .expect(201)
  ).body;
  expect(created.timeline).toEqual(timeline);
  expect(
    (
      await api(
        "get",
        `/tracks/${created.trackId}/acoustic-profile`,
        "listener",
      ).expect(200)
    ).body.timeline,
  ).toEqual(timeline);
  const updated = (
    await api("put", `/tracks/${created.trackId}`)
      .send(edit(created, { title: "Updated grounded fixture" }))
      .expect(200)
  ).body;
  expect(updated.timeline).toEqual(timeline);
});
