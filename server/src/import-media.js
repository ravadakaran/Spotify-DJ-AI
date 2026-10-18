import path from 'node:path';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { parseBuffer } from 'music-metadata';
import { hash } from './auth.js';

const stableId = (digest) => `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
export async function importMedia({ source, assetRoot, models, connection }) {
  await mkdir(assetRoot, { recursive: true });
  const report = { source: path.resolve(source), imported: [], existing: [], skipped: [], failed: [] };
  const files = (await readdir(source, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name));
  for (const file of files) {
    if (!file.isFile() || !/\.(mp3|wav)$/i.test(file.name)) { report.skipped.push(file.name); continue; }
    try {
      const buffer = await readFile(path.join(source, file.name));
      if (buffer.length > 25 * 1024 * 1024) throw new Error('File exceeds 25 MiB');
      const digest = hash(buffer);
      const assetId = stableId(digest); const trackId = stableId(hash(`track:${digest}`));
      const wav = buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WAVE';
      const mp3 = buffer.toString('ascii',0,3) === 'ID3' || (buffer[0] === 255 && (buffer[1] & 0xe0) === 0xe0);
      if (!wav && !mp3) throw new Error('Invalid audio signature');
      const metadata = await parseBuffer(buffer, { mimeType: wav ? 'audio/wav' : 'audio/mpeg', size: buffer.length }, { duration: true });
      if (!Number.isFinite(metadata.format.duration) || metadata.format.duration <= 0) throw new Error('Invalid audio duration');
      const storageKey = `${assetId}.${wav ? 'wav' : 'mp3'}`;
      const target = path.join(assetRoot, storageKey);
      try { await writeFile(target, buffer, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; if (hash(await readFile(target)) !== digest) throw new Error('Existing asset checksum mismatch'); }
      const exists = await models.Track.exists({ _id: trackId });
      await connection.transaction(async (session) => {
        await models.Asset.updateOne({ _id: assetId }, { $setOnInsert: { storageKey, byteLength: buffer.length, sha256: digest, mimeType: wav ? 'audio/wav' : 'audio/mpeg', licenseLabel: 'YouTube-sourced; license unverified; private local use requested', sourceAttribution: `User-supplied local file: ${file.name}. Source reported as YouTube; original URL not supplied.`, uploadedBy: null, importActor: 'local-operator' } }, { upsert: true, session });
        await models.Track.updateOne({ _id: trackId }, { $setOnInsert: { title: (metadata.common.title || path.parse(file.name).name).slice(0,160), artist: (metadata.common.artist || 'Artist not tagged').slice(0,160), durationSeconds: metadata.format.duration, assetId, acoustic: null, profileStatus: 'pending', profileVersion: 1, demoMetadataOnly: false, timeline: [] } }, { upsert: true, session, runValidators: true });
      });
      report[exists ? 'existing' : 'imported'].push({ file: file.name, trackId, durationSeconds: metadata.format.duration });
    } catch (error) { report.failed.push({ file: file.name, error: error.message }); }
  }
  return report;
}
