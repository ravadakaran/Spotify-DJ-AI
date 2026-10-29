import { mkdir } from "node:fs/promises";
import { readConfig } from "./config.js";
import { connect } from "./persistence.js";
import { createApplication } from "./app.js";
const config = readConfig();
await mkdir(config.assetRoot, { recursive: true });
const db = await connect(config.mongoUri);
const application = createApplication({ ...db, config });
application.server.listen(config.port, config.host, () =>
  console.log(`API listening on http://${config.host}:${config.port}`),
);
let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await application.close();
  await db.connection.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
