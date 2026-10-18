import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
await mkdir("data/assets", { recursive: true });
const example = await readFile(".env.example", "utf8");
try {
  await writeFile(
    ".env",
    example.replace(
      "JWT_SIGNING_KEY=",
      `JWT_SIGNING_KEY=${randomBytes(48).toString("hex")}`,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created private .env. Existing files are never overwritten.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env already exists; left unchanged.");
}
