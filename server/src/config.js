import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../../", import.meta.url));
export function readConfig(env = process.env) {
  const key = env.JWT_SIGNING_KEY;
  if (!key || key.length < 48)
    throw new Error(
      "JWT_SIGNING_KEY must contain at least 48 characters. Run npm run setup.",
    );
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  if (
    env.NODE_ENV === "production" &&
    (env.COOKIE_SECURE !== "true" || !env.APP_ORIGIN?.startsWith("https://"))
  )
    throw new Error("Production requires HTTPS origin and secure cookies.");
  return {
    mongoUri: env.MONGODB_URI,
    key,
    issuer: env.JWT_ISSUER || "ai-dj-local",
    audience: env.JWT_AUDIENCE || "ai-dj-client",
    origin: env.APP_ORIGIN || "http://127.0.0.1:5173",
    port: Number(env.PORT || 3000),
    secure: env.COOKIE_SECURE === "true",
    assetRoot: path.resolve(root, env.ASSET_ROOT || "data/assets"),
  };
}
