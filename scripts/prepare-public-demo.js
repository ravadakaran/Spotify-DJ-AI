// Build-time downloads only: pinned original CC0 recordings, no private media.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../server/src/config.js";
import { digest, validateDemoManifest } from "../server/src/public-demo.js";
const manifest = JSON.parse(await readFile(path.join(root, "evidence/acceptance-legal-media.json"), "utf8"));
validateDemoManifest(manifest);
const directory = path.resolve(root, process.env.ASSET_ROOT || "data/public-demo-assets");
await mkdir(directory, { recursive: true });
async function download(url, expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: "error" });
  if (!response.ok) throw new Error(`Pinned publisher download failed: ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new Error("Publisher file exceeds bound.");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (digest(bytes) !== expected) throw new Error("Publisher hash mismatch.");
  return bytes;
}
await download(manifest.rightsEvidence, manifest.licenseSha256);
await download(manifest.metadataEvidence, manifest.publisherMetadataSha256);
for (const track of manifest.tracks) {
  const target = path.join(directory, `${track.sha256}.m4a`);
  let cached;
  try { cached = await readFile(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!cached || digest(cached) !== track.sha256)
    await writeFile(target, await download(track.downloadUrl, track.sha256), { mode: 0o600 });
}
console.log("Three publisher-hash-verified CC0 tracks prepared in the build artifact.");
