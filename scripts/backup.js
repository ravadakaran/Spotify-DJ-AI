import { readConfig } from "../server/src/config.js";
import mongoose from "mongoose";
import { backup, restore } from "../server/src/backup.js";
import path from "node:path";
const [mode, folder] = process.argv.slice(2);
if (
  !["backup", "restore"].includes(mode) ||
  !folder ||
  process.env.BACKUP_WRITERS_STOPPED !== "true"
)
  throw new Error(
    "Usage: BACKUP_WRITERS_STOPPED=true node --env-file=.env scripts/backup.js backup|restore DIRECTORY. Stop all writers first; restore targets must be empty.",
  );
const config = readConfig(),
  connection = await mongoose
    .createConnection(config.mongoUri, { autoCreate: false, autoIndex: false })
    .asPromise();
try {
  const manifest =
    mode === "backup"
      ? await backup(connection, config.assetRoot, path.resolve(folder))
      : await restore(connection, path.resolve(folder), config.assetRoot);
  console.log(
    JSON.stringify({
      operation: mode,
      collections: manifest.collections.length,
      assets: manifest.assets.length,
    }),
  );
} finally {
  await connection.close();
}
