import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { createModels } from "./models.js";
export async function connect(uri) {
  const connection = await mongoose
    .createConnection(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
    })
    .asPromise();
  return { connection, models: createModels(connection) };
}
export async function migrate(connection, models) {
  const source = await readFile(new URL("./models.js", import.meta.url));
  const checksum = createHash("sha256").update(source).digest("hex");
  const ledger = connection.collection("schema_migrations");
  const existing = await ledger.findOne({ _id: "001-foundation" });
  if (existing && existing.checksum !== checksum)
    throw new Error(
      "Migration checksum changed. Add a new migration instead of editing an applied schema.",
    );
  if (existing) return;
  // Initial migration is idempotent; DB indexes arbitrate simultaneous runners.
  for (const model of Object.values(models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  await ledger.updateOne(
    { _id: "001-foundation" },
    { $setOnInsert: { checksum, appliedAt: new Date() } },
    { upsert: true },
  );
}
export const seedProfiles = [
  {
    _id: "00000000-0000-4000-8000-000000000001",
    title: "Study in Amber",
    artist: "Metadata fixture",
    durationSeconds: 210,
    acoustic: { bpm: 120, camelotKey: "8A", energy: 0.6, valence: 0.65 },
  },
  {
    _id: "00000000-0000-4000-8000-000000000002",
    title: "Night Geometry",
    artist: "Metadata fixture",
    durationSeconds: 220,
    acoustic: { bpm: 124, camelotKey: "9A", energy: 0.7, valence: 0.7 },
  },
  {
    _id: "00000000-0000-4000-8000-000000000003",
    title: "After the Rain",
    artist: "Metadata fixture",
    durationSeconds: 230,
    acoustic: { bpm: 128, camelotKey: "9B", energy: 0.65, valence: 0.6 },
  },
];
export async function seed(models) {
  for (const track of seedProfiles)
    await models.Track.updateOne(
      { _id: track._id },
      {
        $setOnInsert: {
          ...track,
          assetId: null,
          demoMetadataOnly: true,
          timeline: [],
          profileVersion: 1,
        },
      },
      { upsert: true, runValidators: true },
    );
}
