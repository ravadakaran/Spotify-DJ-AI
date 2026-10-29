import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { fixture } from "../../scripts/phase-six-fixture.js";
import { readConfig, root } from "../src/config.js";
import { seedProfiles } from "../src/persistence.js";
import { digest, validateDemoManifest, seedPublicDemo, claimPublicRuntime, releasePublicRuntime } from "../src/public-demo.js";

let f;
beforeAll(async () => { f = await fixture(); });
afterAll(async () => { await f?.close(); });

test("public bind is opt-in and invalid bind addresses fail closed", () => {
  const env = { JWT_SIGNING_KEY: "x".repeat(64), MONGODB_URI: "mongodb://unused/test" };
  expect(readConfig(env).host).toBe("127.0.0.1");
  expect(readConfig({ ...env, HOST: "0.0.0.0", DEMO_READ_ONLY_CATALOG: "true" })).toMatchObject({ host: "0.0.0.0", readOnlyCatalog: true });
  expect(() => readConfig({ ...env, HOST: "untrusted.example" })).toThrow("HOST");
});

test("overlapping runtimes cannot own the database; wrong owners cannot release it", async () => {
  const owner = randomUUID();
  await claimPublicRuntime(f.connection, owner);
  try {
    await expect(claimPublicRuntime(f.connection, randomUUID())).rejects.toThrow("already owned");
    expect(await releasePublicRuntime(f.connection, randomUUID())).toBe(false);
  } finally { expect(await releasePublicRuntime(f.connection, owner)).toBe(true); }
});

test("verified build asset seeding is idempotent and preserves existing tracks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "public-demo-fixture-"));
  const manifest = JSON.parse(await readFile(path.join(root, "evidence/acceptance-legal-media.json"), "utf8"));
  // Synthetic bytes test integrity/idempotency only, never playback or licensing.
  manifest.tracks = manifest.tracks.map((source, index) => {
    const bytes = Buffer.from(`Synthetic non-playable fixture ${index}`);
    return { ...source, sha256: digest(bytes), bytes: bytes.length, fixtureBytes: bytes };
  });
  try {
    for (const track of manifest.tracks) await writeFile(path.join(directory, `${track.sha256}.m4a`), track.fixtureBytes);
    await seedPublicDemo(f.models, manifest, directory);
    const before = await f.models.Track.countDocuments();
    const first = await f.models.Asset.findOne({ sha256: manifest.tracks[0].sha256 });
    await f.models.Track.updateOne({ assetId: first._id }, { $set: { title: "Preserved operator edit" } });
    await seedPublicDemo(f.models, manifest, directory);
    expect(await f.models.Track.countDocuments()).toBe(before);
    expect((await f.models.Track.findOne({ assetId: first._id })).title).toBe("Preserved operator edit");
    await writeFile(path.join(directory, `${manifest.tracks[0].sha256}.m4a`), "corruption");
    await expect(seedPublicDemo(f.models, manifest, directory)).rejects.toThrow("hash mismatch");
    expect(() => validateDemoManifest({ ...manifest, license: "unverified" })).toThrow("provenance");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("read-only catalog denies admin and member writes but permits room creation", async () => {
  const admin = await f.user(901), member = await f.user(902);
  await f.models.User.updateOne({ _id: admin.id }, { $set: { isAdmin: true } });
  f.config.readOnlyCatalog = true;
  try {
    for (const user of [admin, member]) {
      for (const [method, route] of [["post", "/assets"], ["put", `/tracks/${seedProfiles[0]._id}`], ["delete", `/tracks/${seedProfiles[0]._id}`]]) {
        const response = await request(f.app.app)[method](`/api/v1${route}`).set("Authorization", `Bearer ${user.token}`);
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("DEMO_CATALOG_READ_ONLY");
      }
    }
    await request(f.app.app).post("/api/v1/assets").expect(401);
    const room = await request(f.app.app).post("/api/v1/lounges").set("Authorization", `Bearer ${member.token}`).send({ seedTrackId: seedProfiles[0]._id, vibeProfile: "Public demo fixture", maxParticipants: 5, bpmTolerancePct: 8, soundclashEnabled: true, aiVerbosity: "normal" }).expect(201);
    await request(f.app.app).post(`/api/v1/lounges/${room.body.loungeId}/end`).set("Authorization", `Bearer ${member.token}`).send({ expectedRevision: room.body.revision }).expect(200);
  } finally { f.config.readOnlyCatalog = false; }
});
