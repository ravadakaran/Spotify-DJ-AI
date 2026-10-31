// Offline, idempotent import of the project's pinned publisher-licensed examples.
import process from "node:process";
import console from "node:console";
import { readFile, writeFile, stat, chown } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { connect } from "/opt/ai-dj/server/src/persistence.js";
import { inspectAudio } from "/opt/ai-dj/server/src/audio.js";
const { fetch, AbortSignal } = globalThis;

const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
if (
  manifest.upstreamCommit !== "e1d0d5c0422d2626c211d5d877e6f69c37ce8712" ||
  manifest.license !== "CC0-1.0"
)
  throw new Error("Unexpected demo provenance");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function download(url) {
  const allowed = `https://raw.githubusercontent.com/ichbinsoftware/everythingisfree/${manifest.upstreamCommit}/`;
  if (!url.startsWith(allowed)) throw new Error("Unexpected publisher URL");
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw new Error(`Publisher request failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024)
    throw new Error("Publisher file exceeds application bound");
  return bytes;
}
if (
  digest(await download(manifest.rightsEvidence)) !== manifest.licenseSha256 ||
  digest(await download(manifest.metadataEvidence)) !==
    manifest.publisherMetadataSha256
)
  throw new Error("Publisher license/metadata hash mismatch");
const db = await connect(process.env.MONGODB_URI);
try {
  if (await db.models.Lounge.exists({ status: { $ne: "ended" } }))
    throw new Error("End all lounges before the offline demo import");
  const imported = [];
  for (const source of manifest.tracks) {
    const bytes = await download(source.downloadUrl);
    if (digest(bytes) !== source.sha256) throw new Error("Audio hash mismatch");
    const audio = await inspectAudio(bytes);
    const storageKey = `${source.sha256}.${audio.extension}`;
    const filename = path.join(process.env.ASSET_ROOT, storageKey);
    const owner = await stat(process.env.ASSET_ROOT);
    try {
      await writeFile(filename, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (
        error.code !== "EEXIST" ||
        digest(await readFile(filename)) !== source.sha256
      )
        throw error;
    }
    await chown(filename, owner.uid, owner.gid);
    let asset = await db.models.Asset.findOne({ sha256: source.sha256 });
    if (!asset)
      asset = await db.models.Asset.create({
        storageKey,
        sha256: source.sha256,
        mimeType: audio.mimeType,
        byteLength: bytes.length,
        licenseLabel: "CC0-1.0 — original publisher",
        sourceAttribution: `${source.artist}; ${manifest.upstreamRepository} at ${manifest.upstreamCommit}; ${manifest.rightsEvidence}`,
      });
    let track = await db.models.Track.findOne({ assetId: asset._id });
    if (!track)
      track = await db.models.Track.create({
        title: source.title,
        artist: source.artist,
        durationSeconds: audio.metadata.format.duration,
        assetId: asset._id,
        profileStatus: "ready",
        acoustic: source.acoustic,
        timeline: [
          {
            id: randomUUID(),
            ts: 0,
            type: "trivia",
            text: `Artist: ${source.artist}. Album: Everything is Free. Publisher specifies ${source.bpm} BPM in ${source.key}. License: CC0-1.0. Energy/valence are authored neutral demo values.`,
            sourceLabel: `Original publisher metadata at ${manifest.upstreamCommit}`,
          },
        ],
      });
    imported.push({
      title: source.title,
      trackId: track._id,
      assetId: asset._id,
      sha256: source.sha256,
    });
  }
  // Readable by the app account; never expose this filesystem via a public static route.
  await writeFile(
    "/etc/ai-dj/demo-media-report.json",
    JSON.stringify(
      {
        license: manifest.license,
        upstreamCommit: manifest.upstreamCommit,
        tracks: imported,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Three hash-verified CC0 demo tracks available; private catalog was not transferred.",
  );
} finally {
  await db.connection.close();
}
