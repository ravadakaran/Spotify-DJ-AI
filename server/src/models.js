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
      uploadedBy: { type: String, ref: "users", default: null },
      importActor: String,
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
      profileStatus: {
        type: String,
        enum: ["ready", "pending"],
        default: "ready",
      },
      acoustic: {
        type: new Schema(
          {
            bpm: { type: Number, required: true, min: 0.001 },
            camelotKey: {
              type: String,
              required: true,
              match: /^(?:[1-9]|1[0-2])[AB]$/,
            },
            energy: { type: Number, required: true, min: 0, max: 1 },
            valence: { type: Number, required: true, min: 0, max: 1 },
          },
          { _id: false },
        ),
        default: null,
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
  const Receipt = model(
    "command_receipts",
    {
      actorId: ref("users"),
      commandId: String,
      requestHash: String,
      response: Schema.Types.Mixed,
      expiresAt: Date,
    },
    [
      [{ actorId: 1, commandId: 1 }, { unique: true }],
      [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
    ],
  );
  const QueueEvent = model(
    "queue_events",
    {
      loungeId: ref("lounges"),
      epoch: { type: String, required: true },
      revision: { type: Number, required: true, min: 0 },
      eventSeq: { type: Number, required: true, min: 0 },
      commandId: { type: String, required: true },
      actorId: String,
      type: { type: String, required: true },
      payload: { type: Schema.Types.Mixed, required: true },
      reducerVersion: { type: Number, required: true },
      occurredAt: { type: Date, required: true },
      receipt: Schema.Types.Mixed,
    },
    [
      [{ loungeId: 1, epoch: 1, revision: 1, eventSeq: 1 }, { unique: true }],
      [{ loungeId: 1, commandId: 1 }, {}],
    ],
  );
  const RoomSnapshot = model(
    "room_snapshots",
    {
      loungeId: ref("lounges"),
      epoch: { type: String, required: true },
      revision: { type: Number, required: true, min: 0 },
      reducerVersion: { type: Number, required: true },
      state: { type: Schema.Types.Mixed, required: true },
      persistedAt: { type: Date, required: true },
    },
    [[{ loungeId: 1 }, { unique: true }]],
  );
  const ChatMessage = model(
    "chat_messages",
    {
      loungeId: ref("lounges"),
      messageId: { type: String, required: true },
      userId: String,
      displayName: String,
      body: { type: String, required: true, maxlength: 1000 },
      msgType: {
        type: String,
        enum: ["chat", "dj_announcement"],
        required: true,
      },
      sentimentScore: Number,
      sentimentBucket: String,
      algorithmVersion: String,
      generationMode: String,
      tsSeconds: Number,
      revision: Number,
      reactions: { type: Schema.Types.Mixed, default: {} },
    },
    [
      [{ messageId: 1 }, { unique: true }],
      [{ loungeId: 1, revision: -1 }, {}],
    ],
  );
  const Interaction = model(
    "interactions",
    {
      loungeId: ref("lounges"),
      userId: ref("users"),
      playbackId: String,
      trackId: ref("tracks"),
      playedSeconds: { type: Number, min: 0 },
      completed: Boolean,
      liked: Boolean,
      acoustic: Schema.Types.Mixed,
      observedAt: Date,
      revision: Number,
    },
    [
      [{ loungeId: 1, userId: 1, playbackId: 1 }, { unique: true }],
      [{ userId: 1, createdAt: -1, _id: -1 }, {}],
    ],
  );
  const SessionSummary = model(
    "session_summaries",
    { loungeId: ref("lounges"), summary: Schema.Types.Mixed, revision: Number },
    [[{ loungeId: 1 }, { unique: true }]],
  );
  const RecommendationJob = model("recommendation_jobs", {
    status: String,
    modelVersion: String,
    artifact: Schema.Types.Mixed,
    failureReason: String,
  });
  return {
    Interaction,
    SessionSummary,
    RecommendationJob,
    ChatMessage,
    User,
    Session,
    Asset,
    Track,
    Lounge,
    Membership,
    Receipt,
    QueueEvent,
    RoomSnapshot,
  };
}
