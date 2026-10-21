import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { createModels } from "./models.js";
import { randomUUID } from "node:crypto";
import { createModels as initialModels } from "../migrations/001-foundation-models.js";
import { up as phaseOne } from "../migrations/002-phase-one.js";
import { up as liveRooms } from "../migrations/003-live-rooms.js";
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
  const ledger = connection.collection("schema_migrations");
  const owner = randomUUID();
  const locks = connection.collection("migration_locks");
  try {
    await locks.insertOne({ _id: "runner", owner, startedAt: new Date() });
  } catch (error) {
    if (error.code === 11000)
      throw new Error(
        "Migration runner locked. Verify the prior runner stopped before manually clearing its lock.",
      );
    throw error;
  }
  try {
    const migrations = [
      {
        id: "001-foundation",
        file: "../migrations/001-foundation-models.js",
        up: async () => {
          const isolated = connection.useDb(connection.name);
          const initial = initialModels(isolated);
          for (const model of Object.values(initial)) {
            await model.createCollection();
            await model.createIndexes();
          }
        },
      },
      {
        id: "002-phase-one",
        file: "../migrations/002-phase-one.js",
        up: () => phaseOne(connection, models),
      },
      {
        id: "003-live-rooms",
        file: "../migrations/003-live-rooms.js",
        up: () => liveRooms(connection, models),
      },
    ];
    for (const migration of migrations) {
      const source = await readFile(new URL(migration.file, import.meta.url));
      const checksum = createHash("sha256").update(source).digest("hex");
      const existing = await ledger.findOne({ _id: migration.id });
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(`Migration checksum changed: ${migration.id}`);
        continue;
      }
      await migration.up();
      await ledger.insertOne({
        _id: migration.id,
        checksum,
        appliedAt: new Date(),
      });
    }
  } finally {
    await locks.deleteOne({ _id: "runner", owner });
  }
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
