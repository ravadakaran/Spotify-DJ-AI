import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readConfig, root } from "../server/src/config.js";
import { connect, migrate } from "../server/src/persistence.js";
import { createApplication } from "../server/src/app.js";
import { claimPublicRuntime, releasePublicRuntime, seedPublicDemo } from "../server/src/public-demo.js";

const owner = randomUUID();
let db, application, owns = false, closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  // A failed flush leaves ownership in place for explicit recovery.
  try {
    await application?.close();
    if (owns) await releasePublicRuntime(db.connection, owner);
  } finally { await db?.connection.close(); }
}
try {
  const config = readConfig();
  if (!config.readOnlyCatalog) throw new Error("Public demo requires read-only catalog.");
  db = await connect(config.mongoUri);
  if (db.connection.name !== "ai_dj_public_demo") throw new Error("Expected dedicated public demo database.");
  await claimPublicRuntime(db.connection, owner);
  owns = true;
  await mkdir(config.assetRoot, { recursive: true });
  await migrate(db.connection, db.models);
  const manifest = JSON.parse(await readFile(path.join(root, "evidence/acceptance-legal-media.json"), "utf8"));
  await seedPublicDemo(db.models, manifest, config.assetRoot);
  application = createApplication({ ...db, config });
  await new Promise((resolve, reject) => {
    application.server.once("error", reject);
    application.server.listen(config.port, config.host, resolve);
  });
  const shutdown = () => { void stop().catch(() => { console.error("Shutdown failed; ownership retained for operator recovery."); process.exitCode = 1; }); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log("Public demo listening; catalogue is read-only and AI uses labelled fallback.");
} catch {
  await stop();
  console.error("Public demo startup failed. Check database access, ownership and verified build assets; credentials omitted.");
  process.exitCode = 1;
}
