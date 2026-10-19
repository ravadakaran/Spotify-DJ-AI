import { createInterface } from "node:readline/promises";
import argon2 from "argon2";
import { readConfig } from "./config.js";
import { connect, migrate, seed } from "./persistence.js";
import { passwordOptions } from "./auth.js";
import { schemas } from "./validation.js";
import { readFile } from "node:fs/promises";
import { root } from "./config.js";
import path from "node:path";
const config = readConfig();
if (process.argv.includes("--local"))
  config.mongoUri = JSON.parse(
    await readFile(path.join(root, "data/local-connection.json"), "utf8"),
  ).mongoUri;
const db = await connect(config.mongoUri);
try {
  const command = process.argv[2];
  if (command === "migrate") {
    await migrate(db.connection, db.models);
    console.log("Foundation migration verified.");
  } else if (command === "seed") {
    await seed(db.models);
    console.log("Metadata-only fixtures seeded. No audio imported.");
  } else if (command === "admin") {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const email = await rl.question("Admin email: ");
      const displayName = await rl.question("Display name: ");
      // Password is accepted through a temporary environment variable to avoid echo and command history.
      const data = schemas.register.parse({
        email,
        displayName,
        password: process.env.ADMIN_PASSWORD,
      });
      await db.models.User.create({
        emailNormalized: data.email.toLowerCase(),
        displayName: data.displayName,
        passwordHash: await argon2.hash(data.password, passwordOptions),
        isAdmin: true,
      });
      console.log("Admin created. Clear ADMIN_PASSWORD from this shell.");
    } finally {
      rl.close();
    }
  } else throw new Error("Expected migrate, seed or admin.");
} finally {
  await db.connection.close();
}
