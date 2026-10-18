import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
const { Schema } = mongoose;
const base = {
  _id: { type: String, default: () => randomUUID() },
  schemaVersion: { type: Number, default: 1 },
};
const options = { timestamps: true, versionKey: false };
const ref = (model) => ({ type: String, ref: model, required: true });
export function createModels(connection) {
  const model = (name, fields, indexes = []) => {
    const schema = new Schema({ ...base, ...fields }, options);
    indexes.forEach(([key, config]) => schema.index(key, config));
    return connection.model(name, schema, name);
  };
  const User = model(
    "users",
    {
      emailNormalized: { type: String, required: true },
      displayName: { type: String, required: true, maxlength: 80 },
      passwordHash: { type: String, required: true, select: false },
      isAdmin: { type: Boolean, default: false },
    },
    [[{ emailNormalized: 1 }, { unique: true }]],
  );
  const Session = model(
    "refresh_sessions",
    {
      userId: ref("users"),
      tokenHash: { type: String, required: true },
      consumedHashes: [String],
      expiresAt: { type: Date, required: true },
      revokedAt: Date,
    },
    [
      [{ tokenHash: 1 }, { unique: true }],
      [{ userId: 1 }, {}],
      [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
    ],
  );
  const Asset = model(
    "audio_assets",
    {
      storageKey: { type: String, required: true },
      mimeType: String,
      byteLength: Number,
      sha256: String,
      licenseLabel: { type: String, required: true },
      sourceAttribution: { type: String, required: true },
      uploadedBy: ref("users"),
    },
    [[{ storageKey: 1 }, { unique: true }]],
  );
  const Track = model(
    "tracks",
    {
      title: { type: String, required: true },
      artist: { type: String, required: true },
      durationSeconds: { type: Number, required: true, min: 0.001 },
      assetId: { type: String, ref: "audio_assets", default: null },
      acoustic: {
        bpm: { type: Number, required: true, min: 0.001 },
        camelotKey: {
          type: String,
          required: true,
          match: /^(?:[1-9]|1[0-2])[AB]$/,
        },
        energy: { type: Number, required: true, min: 0, max: 1 },
        valence: { type: Number, required: true, min: 0, max: 1 },
      },
      timeline: [
        {
          _id: false,
          id: String,
          ts: Number,
          type: String,
          text: String,
          sourceLabel: String,
        },
      ],
      profileVersion: { type: Number, default: 1 },
      demoMetadataOnly: { type: Boolean, default: false },
    },
    [[{ "acoustic.bpm": 1, "acoustic.camelotKey": 1 }, {}]],
  );
  const Lounge = model(
    "lounges",
    {
      hostUserId: ref("users"),
      seedTrackId: ref("tracks"),
      vibeProfile: String,
      status: {
        type: String,
        enum: ["scheduled", "live", "ended"],
        default: "scheduled",
      },
      settings: {
        maxParticipants: Number,
        bpmTolerancePct: Number,
        soundclashEnabled: Boolean,
        aiVerbosity: String,
      },
      inviteHash: { type: String, required: true },
      inviteExpiresAt: Date,
      locked: { type: Boolean, default: false },
      revision: { type: Number, default: 1 },
    },
    [[{ inviteHash: 1 }, { unique: true }]],
  );
  const Membership = model(
    "memberships",
    {
      loungeId: ref("lounges"),
      userId: ref("users"),
      role: {
        type: String,
        enum: ["listener", "co_dj", "host"],
        required: true,
      },
      muted: { type: Boolean, default: false },
      removed: { type: Boolean, default: false },
    },
    [[{ loungeId: 1, userId: 1 }, { unique: true }]],
  );
  return { User, Session, Asset, Track, Lounge, Membership };
}
