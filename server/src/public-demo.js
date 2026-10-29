import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const publisherRevision = "e1d0d5c0422d2626c211d5d877e6f69c37ce8712";
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function validateDemoManifest(manifest) {
  if (manifest.upstreamCommit !== publisherRevision || manifest.license !== "CC0-1.0" || manifest.tracks.length !== 3)
    throw new Error("Unexpected demo provenance.");
  const prefix = `https://raw.githubusercontent.com/ichbinsoftware/everythingisfree/${publisherRevision}/`;
  for (const url of [manifest.rightsEvidence, manifest.metadataEvidence, ...manifest.tracks.map((track) => track.downloadUrl)])
    if (!url.startsWith(prefix)) throw new Error("Unexpected publisher URL.");
  for (const track of manifest.tracks)
    if (!/^[a-f0-9]{64}$/.test(track.sha256) || track.bytes > 25 * 1024 * 1024 || track.mimeType !== "audio/mp4")
      throw new Error("Invalid demo media metadata.");
}

export async function seedPublicDemo(models, manifest, assetRoot) {
  validateDemoManifest(manifest);
  // Verify all bundled files before changing any catalog records.
  for (const track of manifest.tracks) {
    const bytes = await readFile(path.join(assetRoot, `${track.sha256}.m4a`));
    if (bytes.length !== track.bytes || digest(bytes) !== track.sha256)
      throw new Error("Bundled demo audio hash mismatch.");
  }
  for (const source of manifest.tracks) {
    const asset = await models.Asset.findOneAndUpdate(
      { sha256: source.sha256 },
      { $setOnInsert: { storageKey: `${source.sha256}.m4a`, sha256: source.sha256, mimeType: source.mimeType, byteLength: source.bytes,
        licenseLabel: "CC0-1.0 — original publisher", sourceAttribution: `${source.artist}; ${source.downloadUrl}; ${manifest.rightsEvidence}` } },
      { upsert: true, new: true, runValidators: true },
    );
    await models.Track.findOneAndUpdate(
      { assetId: asset._id },
      { $setOnInsert: { title: source.title, artist: source.artist, durationSeconds: source.durationSeconds, assetId: asset._id,
        profileStatus: "ready", acoustic: source.acoustic,
        timeline: [{ id: randomUUID(), ts: 0, type: "trivia",
          text: `Artist: ${source.artist}. Album: Everything is Free. Publisher specifies ${source.bpm} BPM in ${source.key}. License: CC0-1.0. Energy/valence are authored neutral demo values.`,
          sourceLabel: `Original publisher metadata at ${publisherRevision}` }] } },
      { upsert: true, new: true, runValidators: true },
    );
  }
}

// A non-expiring ownership record deliberately fails closed on crashes and
// overlapping provider deploys. Never steal it based on a guessed timeout.
export async function claimPublicRuntime(connection, owner) {
  try {
    await connection.collection("deployment_locks").insertOne({ _id: "public-demo-runtime", owner, startedAt: new Date() });
  } catch (error) {
    if (error.code === 11000) throw new Error("Public demo runtime already owned. Stop and verify the prior instance before operator recovery.");
    throw error;
  }
}
export async function releasePublicRuntime(connection, owner) {
  return (await connection.collection("deployment_locks").deleteOne({ _id: "public-demo-runtime", owner })).deletedCount === 1;
}
