import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, readConfig } from "../server/src/config.js";
import { connect, migrate } from "../server/src/persistence.js";
import { importMedia } from "../server/src/import-media.js";
process.loadEnvFile(path.join(root, ".env"));
const folder = path.join(root, "data/local-db");
await mkdir(folder, { recursive: true });
const port = Number(process.env.LOCAL_MONGO_PORT || 50109);
const repl = await MongoMemoryReplSet.create({
  instanceOpts: [{ dbPath: folder, port }],
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
let db;
try {
  const config = readConfig({
    ...process.env,
    MONGODB_URI: repl.getUri("ai_dj_local"),
  });
  db = await connect(config.mongoUri);
  const backupDir = path.join(
    root,
    "data/backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(backupDir, { recursive: true });
  const { BSON } = await import("mongodb");
  for (const collection of await db.connection.db.listCollections().toArray()) {
    const documents = await db.connection
      .collection(collection.name)
      .find()
      .toArray();
    await writeFile(
      path.join(backupDir, `${collection.name}.json`),
      BSON.EJSON.stringify(documents),
      { mode: 0o600 },
    );
  }
  console.log("Saved private Extended JSON database backup before migrations.");
  await migrate(db.connection, db.models);
  const report = await importMedia({
    source: process.argv[2] || "D:\\DJ",
    assetRoot: config.assetRoot,
    models: db.models,
    connection: db.connection,
  });
  await mkdir(path.join(root, "data/import-reports"), { recursive: true });
  await writeFile(
    path.join(root, "data/import-reports/latest.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      imported: report.imported.length,
      existing: report.existing.length,
      skipped: report.skipped.length,
      failed: report.failed,
    }),
  );
} finally {
  await db?.connection.close();
  await repl.stop({ doCleanup: false });
}
