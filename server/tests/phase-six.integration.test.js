import request from "supertest";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fixture, emit } from "../../scripts/phase-six-fixture.js";
import { backup, restore } from "../src/backup.js";
import { migrate } from "../src/persistence.js";
import mongoose from "mongoose";
import { createModels } from "../src/models.js";
import { RoomService } from "../src/live-rooms.js";

let f, host, guest, room, socket;
beforeAll(async () => {
  await mkdir("evidence", { recursive: true });
  f = await fixture();
  host = await f.user(1);
  guest = await f.user(2);
  room = await f.room(host);
  await f.app.rooms.join(guest.id, { inviteCode: room.inviteCode });
  socket = await f.socket(host, room);
});
afterAll(async () => {
  await f?.close();
});
const api = (method, route, token = host.token) =>
  request(f.app.app)[method]("/api/v1" + route)
    .set("Authorization", `Bearer ${token}`)
    .set("Origin", f.config.origin)
    .set("X-CSRF-Protection", "1");

test("rejects injection, forged authority, origin/CSRF, traversal and oversized bodies without exposing secrets", async () => {
  expect(
    (
      await request(f.app.app)
        .post("/api/v1/auth/login")
        .send({ email: { $ne: null }, password: { $ne: null } })
    ).status,
  ).toBe(422);
  for (const origin of ["https://evil.test", f.config.origin + ".evil.test"])
    expect(
      (await api("post", "/auth/refresh").set("Origin", origin).send({}))
        .status,
    ).toBe(403);
  expect(
    (await api("post", "/auth/refresh").unset("X-CSRF-Protection").send({}))
      .status,
  ).toBe(403);
  expect(
    (
      await api("post", `/lounges/${room.loungeId}/chat`).send(
        JSON.parse('{"body":"x","__proto__":{"isAdmin":true}}'),
      )
    ).status,
  ).toBe(422);
  expect({}.isAdmin).toBeUndefined();
  expect((await api("get", "/tracks?q[$ne]=x")).status).toBeLessThan(500);
  expect((await api("get", "/assets/not-a-uuid/content")).status).toBe(422);
  expect(
    (
      await api("post", `/lounges/${room.loungeId}/chat`).send({
        body: "x".repeat(70000),
      })
    ).status,
  ).toBe(413);
  const state = await f.app.rooms.snapshot(room.loungeId);
  expect(
    (
      await api("post", `/lounges/${room.loungeId}/end`, guest.token).send({
        expectedRevision: state.revision,
      })
    ).status,
  ).toBe(403);
  const guestSocket = await f.socket(guest, room);
  expect(
    (
      await emit(guestSocket, "lounge.command", {
        type: "room.end",
        payload: {
          expectedRevision: (await f.app.rooms.snapshot(room.loungeId))
            .revision,
        },
      })
    ).error.code,
  ).toBe("FORBIDDEN");
  const attack = '<img src=x onerror="globalThis.pwned=true">';
  expect(
    (await api("post", `/lounges/${room.loungeId}/chat`).send({ body: attack }))
      .status,
  ).toBe(201);
  expect((await f.app.rooms.snapshot(room.loungeId)).chat.at(-1).body).toBe(
    attack,
  ); // React must render this as text; browser test verifies.
});

test("media containment rejects a persisted traversal path and admin upload enforces 25 MiB", async () => {
  const previous = f.config.assetRoot;
  const containedRoot = path.join(f.folder, 'contained-root');
  await mkdir(containedRoot);
  await writeFile(path.join(f.folder,'outside.txt'),'test-only private bytes');
  const asset = await f.models.Asset.create({ storageKey:'../outside.txt', mimeType:'audio/wav', byteLength:28, sha256:'test', licenseLabel:'Original test bytes', sourceAttribution:'Path containment fixture' });
  try {
    f.config.assetRoot=containedRoot;
    expect((await api('get',`/assets/${asset._id}/content`)).status).toBe(403);
  } finally { f.config.assetRoot=previous; await f.models.Asset.deleteOne({_id:asset._id}); }
  await f.models.User.updateOne({_id:host.id},{$set:{isAdmin:true}});
  const response = await api('post','/assets').field('licenseLabel','Original test bytes').field('sourceAttribution','Oversize test').attach('file',Buffer.alloc(25*1024*1024+1),{filename:'oversize.wav',contentType:'audio/wav'});
  expect(response.status).toBe(413);
  expect(response.body.error.code).toBe('TOO_LARGE');
});

test("slow transport is disconnected, cross-room events isolated, writer degradation changes readiness", async () => {
  const other = await f.room(guest),
    outsider = await f.socket(guest, other);
  const leaked = [];
  outsider.on("lounge.state.snapshot", (e) => {
    if (e.loungeId === room.loungeId) leaked.push(e);
  });
  const serverSocket = f.app.io.of("/lounges").sockets.get(socket.id);
  serverSocket.conn.writeBuffer.push(
    ...Array.from({ length: 21 }, () => ({ type: "message", data: "test" })),
  );
  const disconnected = new Promise((resolve) =>
    socket.once("disconnect", resolve),
  );
  f.app.rooms.publish(await f.app.rooms.snapshot(room.loungeId));
  await disconnected;
  expect(leaked).toEqual([]);
  expect((await api("get", "/health/ready")).status).toBe(200);
  f.app.rooms.writer.failed = true;
  expect((await api("get", "/health/ready")).status).toBe(503);
  f.app.rooms.writer.failed = false;
});

test("offline backup restores validators, indexes, assets and durable room with a new paused epoch", async () => {
  const source = path.join(f.folder, "source-assets");
  await mkdir(source);
  const bytes = Buffer.from("original restore test asset"),
    storageKey = `${randomUUID()}.wav`;
  await writeFile(path.join(source, storageKey), bytes);
  const asset = await f.models.Asset.create({
    storageKey,
    mimeType: "audio/wav",
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    licenseLabel: "Original test bytes; not playable",
    sourceAttribution: "Phase 6 restore fixture",
  });
  await f.socket(host, room);
  const live = await f.app.rooms.snapshot(room.loungeId);
  await f.models.Track.updateOne({ _id: live.seedTrackId }, { $set: { assetId: asset._id } });
  await f.app.rooms.command(room.loungeId, host.id, "playback.control", { action: "start", expectedRevision: live.revision });
  // Stop timers/commands before the offline snapshot, without ending the room.
  await f.app.rooms.close();
  f.sockets.forEach((s) => s.disconnect());
  const before = await f.models.RoomSnapshot.findOne({
    loungeId: room.loungeId,
  }).lean();
  const directory = path.join(f.folder, "backup");
  const manifest = await backup(f.connection, source, directory);
  const connection = await mongoose
    .createConnection(f.repl.getUri("phase_six_restored_disposable"), {
      autoCreate: false,
      autoIndex: false,
    })
    .asPromise();
  const target = { connection };
  let rooms;
  try {
    const assets = path.join(f.folder, "restored-assets");
    await restore(target.connection, directory, assets);
    target.models = createModels(target.connection);
    await migrate(target.connection, target.models); // Ledger checksums and idempotency survive.
    expect(await readFile(path.join(assets, storageKey))).toEqual(bytes);
    for (const c of manifest.collections)
      expect(await target.connection.collection(c.name).countDocuments()).toBe(
        c.count,
      );
    await expect(restore(target.connection, directory, assets)).rejects.toThrow(
      "empty database",
    );
    await expect(
      target.connection
        .collection("tracks")
        .insertOne({ _id: randomUUID(), bpm: -1 }),
    ).rejects.toThrow();
    rooms = new RoomService(target.models, target.connection, f.config.key);
    const recovered = await rooms.snapshot(room.loungeId);
    expect(recovered.epoch).not.toBe(before.epoch);
    expect(recovered.hostConnected).toBe(false);
    expect(recovered.nowPlaying.paused).toBe(true);
    expect(recovered.nowPlaying.trackId).toBe(before.state.nowPlaying.trackId);
    expect(recovered.chat.map((x) => x.body)).toEqual(
      before.state.chat.map((x) => x.body),
    );
    const checkConnection = await mongoose.createConnection(f.repl.getUri('phase_six_checksum_disposable'), {autoCreate:false,autoIndex:false}).asPromise();
    try {
      await writeFile(path.join(directory,'assets',storageKey),'corrupted bytes');
      await expect(restore(checkConnection,directory,path.join(f.folder,'corrupt-restore-assets'))).rejects.toThrow('Asset checksum mismatch');
      expect(await checkConnection.db.listCollections().toArray()).toHaveLength(0);
    } finally { await checkConnection.close(); }
    await writeFile('evidence/phase-six-restore.json', JSON.stringify({ date:new Date().toISOString(), node:process.version, method:'Offline Extended JSON logical backup; disposable real MongoDB replica set; separate empty restore database', collections:manifest.collections.map(c=>({name:c.name,count:c.count,indexes:c.indexes.length})), assets:manifest.assets.length, checks:{collectionCounts:true,assetBytes:true,strictValidator:true,migrationRerun:true,newEpoch:true,pausedPlayback:true,chatReplay:true,nonemptyTargetRejected:true}, limitations:'Not Database Tools or private-library/VM restore' },null,2));
  } finally {
    await rooms?.close();
    await target.connection.close();
  }
});
