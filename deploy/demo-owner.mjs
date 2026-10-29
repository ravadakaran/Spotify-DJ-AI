// Run with the VM's private environment after migrations; never prints secrets.
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import console from "node:console";
import { connect } from "/opt/ai-dj/server/src/persistence.js";
import { passwordOptions } from "/opt/ai-dj/server/src/auth.js";
const require = createRequire("/opt/ai-dj/package.json");
const argon2 = require("argon2");
const email = process.argv[2];
if (!email?.includes("@")) throw new Error("Provide the owner's email.");
const filename = "/etc/ai-dj/operator-login.json";
try {
  await readFile(filename);
  console.log("Existing operator credentials preserved.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const db = await connect(process.env.MONGODB_URI);
  try {
    if (await db.models.User.findOne({ emailNormalized: email.toLowerCase() }))
      throw new Error(
        "Owner already exists; no password or permissions changed.",
      );
    const password = randomBytes(30).toString("base64url");
    await db.models.User.create({
      emailNormalized: email.toLowerCase(),
      displayName: "Demo operator",
      passwordHash: await argon2.hash(password, passwordOptions),
      isAdmin: true,
    });
    await writeFile(filename, JSON.stringify({ email, password }, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      "Operator created; login saved in the VM's private credential file.",
    );
  } finally {
    await db.connection.close();
  }
}
