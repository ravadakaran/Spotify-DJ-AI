import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inspectAudio } from "../server/src/audio.js";
import { match } from "../server/src/music-engine.js";
const revision = "e1d0d5c0422d2626c211d5d877e6f69c37ce8712";
const base = `https://raw.githubusercontent.com/ichbinsoftware/everythingisfree/${revision}`;
const directory = "data/evaluations/legal-demo";
await mkdir(directory, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fetchFile(relative, target) {
  let bytes;
  try {
    bytes = await readFile(`${directory}/${target}`);
  } catch {
    const response = await fetch(`${base}/${relative}`, {
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new Error(`Source download failed ${response.status}: ${relative}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(`${directory}/${target}`, bytes);
  }
  return bytes;
}
const license = await fetchFile("LICENSE", "LICENSE-CC0.txt");
const index = await fetchFile("index.js", "publisher-metadata.txt");
const sources = [
  {
    title: "Hydrogen",
    directory: "1.Hydrogen",
    bpm: 132,
    key: "D Major",
    camelotKey: "10B",
  },
  {
    title: "Rubidium",
    directory: "5.Rubidium",
    bpm: 132,
    key: "G Major",
    camelotKey: "9B",
  },
  {
    title: "Caesium",
    directory: "6.Caesium",
    bpm: 130,
    key: "C Major",
    camelotKey: "8B",
  },
];
const tracks = [];
for (const source of sources) {
  const filename = `${source.directory}_Master.m4a`;
  const relative = `src/${source.directory}/${filename}`;
  const bytes = await fetchFile(relative, filename);
  if (bytes.length > 25 * 1024 * 1024)
    throw new Error("Source exceeds application media bound");
  const { metadata, mimeType } = await inspectAudio(bytes);
  // Verify the source's metadata block as data; never execute downloaded JS.
  const marker = `title: "${source.title}"`;
  const block = index.toString().split(marker)[1]?.split("stems:")[0];
  if (
    !block?.includes(`bpm: ${source.bpm},`) ||
    !block.includes(`key: "${source.key}"`)
  )
    throw new Error("Publisher metadata changed");
  tracks.push({
    ...source,
    filename,
    localPath: `${directory}/${filename}`,
    downloadUrl: `${base}/${relative}`,
    sha256: hash(bytes),
    bytes: bytes.length,
    mimeType,
    durationSeconds: metadata.format.duration,
    artist: "Software-Entwicklungskit",
    profileStatus: "ready",
    acoustic: {
      bpm: source.bpm,
      camelotKey: source.camelotKey,
      energy: 0.5,
      valence: 0.5,
    },
    profileVerification:
      "BPM/key verified against pinned original publisher metadata; Camelot conversion cross-checked. Duration/container measured. Energy/valence are explicitly authored neutral demo values, not measured affect.",
  });
}
const chain = tracks
  .slice(1)
  .map((candidate, index) => ({
    from: tracks[index].title,
    to: candidate.title,
    match: match(tracks[index].acoustic, candidate.acoustic, 8),
  }));
if (chain.some((edge) => !edge.match))
  throw new Error("Licensed source chain fails deterministic rules");
const manifest = {
  version: "legal-demo-1",
  preparedAt: new Date().toISOString(),
  upstreamRepository: "https://github.com/ichbinsoftware/everythingisfree",
  upstreamCommit: revision,
  license: "CC0-1.0",
  licenseSha256: hash(license),
  publisherMetadataSha256: hash(index),
  rightsEvidence: `${base}/LICENSE`,
  metadataEvidence: `${base}/index.js`,
  camelotReference: "https://mixedinkey.com/camelot-wheel/",
  tracks,
  chain,
  limitations:
    "Publisher-confirmed musical metadata, not an independent musicologist/key-detector certification. Downloaded existing recordings; no synthesis, DSP or public streaming. Private app/catalog untouched.",
};
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "evidence/acceptance-legal-media.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      tracks: tracks.map((t) => ({
        title: t.title,
        seconds: t.durationSeconds,
        sha256: t.sha256,
      })),
      chain,
    },
    null,
    2,
  ),
);
