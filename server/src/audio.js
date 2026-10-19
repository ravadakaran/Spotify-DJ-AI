import { parseBuffer } from "music-metadata";

export async function inspectAudio(buffer) {
  const wav =
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE";
  const mp4 = buffer.toString("ascii", 4, 8) === "ftyp";
  const mp3 =
    buffer.toString("ascii", 0, 3) === "ID3" ||
    (buffer[0] === 255 && (buffer[1] & 0xe0) === 0xe0);
  if (!wav && !mp4 && !mp3)
    throw new Error("Only valid WAV, MP3 or audio-only MP4 is accepted.");
  const mimeType = wav ? "audio/wav" : mp4 ? "audio/mp4" : "audio/mpeg";
  const extension = wav ? "wav" : mp4 ? "m4a" : "mp3";
  const metadata = await parseBuffer(
    buffer,
    { mimeType, size: buffer.length },
    { duration: true },
  );
  if (
    metadata.format.hasVideo ||
    !Number.isFinite(metadata.format.duration) ||
    metadata.format.duration <= 0
  )
    throw new Error(
      "A valid audio-only file with a measurable duration is required.",
    );
  return { metadata, mimeType, extension };
}
