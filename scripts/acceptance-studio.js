import { readFile, copyFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { fixture } from "./phase-six-fixture.js";
import { root } from "../server/src/config.js";
import { ollamaAdapter } from "../server/src/grounding.js";

export async function startAcceptanceStudio({ model } = {}) {
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "data/evaluations/legal-demo/manifest.json"),
      "utf8",
    ),
  );
  const f = await fixture();
  let vite;
  try {
    const tracks = [];
    for (const source of manifest.tracks) {
      const bytes = await readFile(path.join(root, source.localPath));
      if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
        throw new Error(`Audio hash changed: ${source.title}`);
      const storageKey = `${source.sha256}.m4a`;
      await copyFile(
        path.join(root, source.localPath),
        path.join(f.folder, storageKey),
      );
      const asset = await f.models.Asset.create({
        storageKey,
        mimeType: source.mimeType,
        byteLength: bytes.length,
        sha256: source.sha256,
        licenseLabel: "CC0-1.0 — original publisher",
        sourceAttribution: `${source.artist}; ${manifest.upstreamRepository} at ${manifest.upstreamCommit}; ${manifest.rightsEvidence}`,
      });
      const track = await f.models.Track.create({
        title: source.title,
        artist: source.artist,
        durationSeconds: source.durationSeconds,
        assetId: asset._id,
        profileStatus: "ready",
        acoustic: source.acoustic,
        timeline: [
          {
            id: randomUUID(),
            ts: 0,
            type: "trivia",
            text: `Artist: ${source.artist}. Album: Everything is Free. Publisher specifies ${source.bpm} BPM in ${source.key}. License: CC0-1.0.`,
            sourceLabel: `Original publisher metadata at ${manifest.upstreamCommit}`,
          },
        ],
      });
      tracks.push({ ...source, trackId: track._id });
    }
    f.app.rooms.aiProvider = model ? ollamaAdapter(model) : null;
    vite = await createVite({
      root: path.join(root, "client"),
      configFile: path.join(root, "client/vite.config.js"),
      server: {
        port: 0,
        strictPort: false,
        proxy: { "/api": f.url, "/socket.io": { target: f.url, ws: true } },
      },
    });
    await vite.listen();
    const browserUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
    f.config.origin = browserUrl;
    return {
      ...f,
      vite,
      browserUrl,
      manifest,
      tracks,
      async close() {
        await vite.close();
        await f.close();
      },
    };
  } catch (error) {
    await vite?.close();
    await f.close();
    throw error;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const studio = await startAcceptanceStudio({
    model: process.env.OLLAMA_MODEL,
  });
  console.log(`Disposable legal-audio studio: ${studio.browserUrl}`);
  console.log(
    "Create an account in the browser. Starting track Hydrogen; queue Rubidium then Caesium. Enable audio on each device. This studio uses separate disposable data; Ctrl+C ends and removes it.",
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await studio.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
