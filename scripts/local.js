import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root, readConfig } from "../server/src/config.js";
import { connect, migrate, seed } from "../server/src/persistence.js";
import { createApplication } from "../server/src/app.js";
process.loadEnvFile(path.join(root, ".env"));
const folder = path.join(root, "data/local-db");
await mkdir(folder, { recursive: true });
const repl = await MongoMemoryReplSet.create({
  instanceOpts: [{ dbPath: folder }],
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
const config = readConfig({
  ...process.env,
  MONGODB_URI: repl.getUri("ai_dj_local"),
});
await mkdir(config.assetRoot, { recursive: true });
const db = await connect(config.mongoUri);
await migrate(db.connection, db.models);
await seed(db.models);
const application = createApplication({ ...db, config });
await new Promise((resolve) =>
  application.server.listen(config.port, "127.0.0.1", resolve),
);
const web = spawn(
  process.execPath,
  [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
  { cwd: path.join(root, "client"), stdio: "inherit" },
);
console.log(
  "Local development database persists in data/local-db. This command does not use Docker.",
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  web.kill();
  await application.close();
  await db.connection.close();
  await repl.stop({ doCleanup: false });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", stop);
