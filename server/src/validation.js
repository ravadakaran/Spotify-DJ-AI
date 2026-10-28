import { z } from "zod";
const str = (max) => z.string().trim().min(1).max(max);
const finite = z.number().finite();
export const acoustic = z
  .object({
    bpm: finite.positive(),
    camelotKey: z.string().regex(/^(?:[1-9]|1[0-2])[AB]$/),
    energy: finite.min(0).max(1),
    valence: finite.min(0).max(1),
  })
  .strict();
export const timeline = z
  .array(
    z
      .object({
        id: z.uuid(),
        ts: finite.min(0),
        type: z.enum(["sample_credit", "trivia", "glossary"]),
        text: str(2000),
        sourceLabel: str(200),
      })
      .strict(),
  )
  .max(100)
  .refine(
    (items) => new Set(items.map((x) => x.id)).size === items.length,
    "Timeline IDs must be unique",
  );
export const schemas = {
  register: z
    .object({
      email: z.email().max(254),
      password: z.string().min(12).max(128),
      displayName: str(80),
    })
    .strict(),
  login: z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .strict(),
  create: z
    .object({
      seedTrackId: z.uuid(),
      vibeProfile: str(80),
      maxParticipants: z.number().int().min(2).max(50).default(40),
      bpmTolerancePct: finite.min(0).max(8).default(8),
      soundclashEnabled: z.boolean().default(true),
      aiVerbosity: z.enum(["brief", "normal"]).default("normal"),
    })
    .strict(),
  join: z.object({ inviteCode: z.string().regex(/^[A-F0-9]{16}$/i) }).strict(),
  track: z
    .object({
      title: str(160),
      artist: str(160),
      durationSeconds: finite.positive(),
      assetId: z.uuid(),
      acoustic,
      timeline,
    })
    .strict(),
  profile: z
    .object({
      expectedProfileVersion: z.number().int().positive(),
      acoustic,
      timeline,
    })
    .strict(),
  editTrack: z
    .object({
      expectedProfileVersion: z.number().int().positive(),
      title: str(160),
      artist: str(160),
      assetId: z.uuid().nullable(),
      acoustic,
      timeline,
    })
    .strict(),
  deleteTrack: z
    .object({ expectedProfileVersion: z.number().int().positive() })
    .strict(),
};
export function parse(schema, body) {
  return schema.parse(body);
}
export function requireId(value) {
  return z.uuid().parse(value);
}
export function validateTimeline(items, duration) {
  if (items.some((x) => x.ts > duration))
    throw new HttpError(
      422,
      "INVALID_TIMELINE",
      "Timeline time exceeds track duration.",
    );
}
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
