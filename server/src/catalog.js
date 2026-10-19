import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { mkdir, writeFile, unlink, stat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { inspectAudio } from "./audio.js";
import { hash } from "./auth.js";
import {
  HttpError,
  parse,
  schemas,
  requireId,
  validateTimeline,
} from "./validation.js";

export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]))
    throw new HttpError(416, "INVALID_RANGE", "Invalid byte range.");
  let start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (
    ![start, end].every(Number.isSafeInteger) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new HttpError(416, "INVALID_RANGE", "Unsatisfiable byte range.");
  return { start, end: Math.min(end, size - 1) };
}
export function catalogRouter(models, auth, config) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 2 },
  });
  router.post(
    "/assets",
    auth.admin,
    upload.single("file"),
    async (req, res) => {
      const file = req.file;
      const { licenseLabel, sourceAttribution } = req.body;
      if (
        !file ||
        typeof licenseLabel !== "string" ||
        !licenseLabel.trim() ||
        licenseLabel.length > 200 ||
        typeof sourceAttribution !== "string" ||
        !sourceAttribution.trim() ||
        sourceAttribution.length > 1000
      )
        throw new HttpError(
          422,
          "INVALID_ASSET",
          "Audio, license and attribution are required.",
        );
      const b = file.buffer;
      let metadata, mimeType, extension;
      try {
        ({ metadata, mimeType, extension } = await inspectAudio(b));
      } catch (err) {
        throw new HttpError(
          422,
          "INVALID_AUDIO",
          err.message ||
            "Only valid WAV, MP3 or audio-only MP4 audio is accepted.",
        );
      }
      const durationSeconds = metadata.format.duration;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
        throw new HttpError(
          422,
          "INVALID_AUDIO",
          "Audio duration could not be verified.",
        );
      await mkdir(config.assetRoot, { recursive: true });
      const storageKey = `${randomUUID()}.${extension}`;
      const target = path.join(config.assetRoot, storageKey);
      await writeFile(target, b, { flag: "wx" });
      try {
        const asset = await models.Asset.create({
          storageKey,
          mimeType,
          byteLength: b.length,
          sha256: hash(b),
          licenseLabel: licenseLabel.trim(),
          sourceAttribution: sourceAttribution.trim(),
          uploadedBy: req.auth.user._id,
        });
        res.status(201).json({ assetId: asset._id, mimeType, durationSeconds });
      } catch (error) {
        await unlink(target);
        throw error;
      }
    },
  );
  router.get("/assets/:id/content", async (req, res, next) => {
    const asset = await models.Asset.findById(requireId(req.params.id));
    if (!asset) throw new HttpError(404, "NOT_FOUND", "Asset not found.");
    const root = await realpath(config.assetRoot);
    let target;
    try {
      target = await realpath(path.join(root, asset.storageKey));
    } catch {
      throw new HttpError(404, "NOT_FOUND", "Asset file is unavailable.");
    }
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new HttpError(403, "INVALID_PATH", "Asset path is invalid.");
    const info = await stat(target);
    let range;
    try {
      range = parseRange(req.headers.range, info.size);
    } catch (error) {
      res.set("Content-Range", `bytes */${info.size}`);
      throw error;
    }
    res.set({
      "Content-Type": asset.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Length": String(range ? range.end - range.start + 1 : info.size),
    });
    if (range)
      res
        .status(206)
        .set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
    const stream = createReadStream(target, range || {});
    stream.on("error", next);
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
  const profile = (track) => ({
    trackId: track._id,
    title: track.title,
    artist: track.artist,
    durationSeconds: track.durationSeconds,
    assetId: track.assetId,
    demoMetadataOnly: track.demoMetadataOnly,
    acoustic: track.acoustic,
    timeline: track.timeline,
    profileVersion: track.profileVersion,
    profileStatus: track.profileStatus || "ready",
  });
  router.get("/tracks", async (req, res) => {
    const limit = Number(req.query.limit || 20);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (req.query.q &&
        (typeof req.query.q !== "string" || req.query.q.length > 100))
    )
      throw new HttpError(
        400,
        "INVALID_QUERY",
        "Invalid pagination or search.",
      );
    const filter = {};
    if (req.query.q)
      filter.title = {
        $regex: req.query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    if (req.query.cursor) {
      let cursor;
      try {
        cursor = JSON.parse(
          Buffer.from(req.query.cursor, "base64url").toString(),
        );
        requireId(cursor.id);
        if (!Number.isFinite(Date.parse(cursor.at))) throw new Error();
      } catch {
        throw new HttpError(400, "INVALID_CURSOR", "Invalid cursor.");
      }
      filter.$or = [
        { createdAt: { $gt: new Date(cursor.at) } },
        { createdAt: new Date(cursor.at), _id: { $gt: cursor.id } },
      ];
    }
    const rows = await models.Track.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .lean();
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    res.json({
      items: items.map(profile),
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({
                at: last.createdAt.toISOString(),
                id: last._id,
              }),
            ).toString("base64url")
          : null,
    });
  });
  router.post("/tracks", auth.admin, async (req, res) => {
    const body = parse(schemas.track, req.body);
    validateTimeline(body.timeline, body.durationSeconds);
    if (!(await models.Asset.exists({ _id: body.assetId })))
      throw new HttpError(
        422,
        "INVALID_ASSET",
        "Upload a licensed local asset first.",
      );
    res.status(201).json(profile(await models.Track.create(body)));
  });
  router.get("/tracks/:id/acoustic-profile", async (req, res) => {
    const track = await models.Track.findById(requireId(req.params.id));
    if (!track) throw new HttpError(404, "NOT_FOUND", "Track not found.");
    res.json(profile(track));
  });
  router.put("/tracks/:id/acoustic-profile", auth.admin, async (req, res) => {
    const id = requireId(req.params.id);
    const body = parse(schemas.profile, req.body);
    const original = await models.Track.findById(id);
    if (!original) throw new HttpError(404, "NOT_FOUND", "Track not found.");
    validateTimeline(body.timeline, original.durationSeconds);
    const track = await models.Track.findOneAndUpdate(
      { _id: id, profileVersion: body.expectedProfileVersion },
      {
        $set: {
          acoustic: body.acoustic,
          timeline: body.timeline,
          profileStatus: "ready",
        },
        $inc: { profileVersion: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!track)
      throw new HttpError(
        409,
        "STALE_PROFILE",
        "Reload the track profile before editing.",
      );
    res.json(profile(track));
  });
  return router;
}
