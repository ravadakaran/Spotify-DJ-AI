import { createHmac, randomUUID } from "node:crypto";
import { hash } from "./auth.js";
import { HttpError, parse, schemas, requireId } from "./validation.js";

export class RoomService {
  constructor(models, connection, receiptKey) {
    this.models = models;
    this.connection = connection;
    this.epoch = randomUUID();
    this.locks = new Map();
    this.pendingCounts = new Map();
    this.publish = () => {};
    this.receiptKey = receiptKey;
  }
  async serial(id, operation) {
    const count = this.pendingCounts.get(id) || 0;
    if (count >= 512)
      throw new HttpError(429, "ROOM_BUSY", "Too many pending room commands.");
    this.pendingCounts.set(id, count + 1);
    const prior = this.locks.get(id) || Promise.resolve();
    const next = prior.catch(() => {}).then(operation);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      const remaining = this.pendingCounts.get(id) - 1;
      if (remaining) this.pendingCounts.set(id, remaining);
      else this.pendingCounts.delete(id);
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  async member(loungeId, userId, roles) {
    requireId(loungeId);
    const member = await this.models.Membership.findOne({
      loungeId,
      userId,
      removed: false,
    });
    if (!member || (roles && !roles.includes(member.role)))
      throw new HttpError(
        403,
        "FORBIDDEN",
        "This lounge is not available to your role.",
      );
    return member;
  }
  async snapshot(id) {
    return this.databaseSnapshot(id);
  }
  async databaseSnapshot(id) {
    const lounge = await this.models.Lounge.findById(id).lean();
    if (!lounge) throw new HttpError(404, "NOT_FOUND", "Lounge not found.");
    const memberships = await this.models.Membership.find({
      loungeId: id,
      removed: false,
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const users = await this.models.User.find({
      _id: { $in: memberships.map((m) => m.userId) },
    }).lean();
    return {
      loungeId: id,
      epoch: this.epoch,
      revision: lounge.revision,
      durableRevision: lounge.revision,
      status: lounge.status,
      hostUserId: lounge.hostUserId,
      vibeProfile: lounge.vibeProfile,
      settings: lounge.settings,
      seedTrackId: lounge.seedTrackId,
      locked: lounge.locked,
      nowPlaying: null,
      nextUp: [],
      battle: null,
      sentiment: { rollingScore: 0, sampleSize: 0, windowSeconds: 30 },
      members: memberships.map((m) => ({
        userId: m.userId,
        role: m.role,
        muted: m.muted,
        displayName:
          users.find((u) => u._id === m.userId)?.displayName || "Participant",
      })),
    };
  }
  async create(userId, input, commandId = randomUUID()) {
    requireId(commandId);
    return this.serial("catalog", () =>
      this.serial(`create:${userId}`, () =>
        this.createOnce(userId, input, commandId),
      ),
    );
  }
  async createOnce(userId, input, commandId) {
    const body = parse(schemas.create, input);
    const requestHash = hash(JSON.stringify(body));
    const inviteCode = createHmac("sha256", this.receiptKey)
      .update(`${userId}:${commandId}`)
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();
    const previous = await this.models.Receipt.findOne({
      actorId: userId,
      commandId,
    });
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new HttpError(
          409,
          "COMMAND_CONFLICT",
          "Command ID already used for a different request.",
        );
      return {
        ...(await this.snapshot(previous.response.loungeId)),
        inviteCode,
        createdAt: previous.response.createdAt,
      };
    }
    if (!(await this.models.Track.exists({ _id: body.seedTrackId })))
      throw new HttpError(422, "INVALID_TRACK", "Choose a catalog track.");
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.connection.transaction(async (session) => {
      await this.models.Lounge.create(
        [
          {
            _id: id,
            hostUserId: userId,
            seedTrackId: body.seedTrackId,
            vibeProfile: body.vibeProfile,
            settings: {
              maxParticipants: body.maxParticipants,
              bpmTolerancePct: body.bpmTolerancePct,
              soundclashEnabled: body.soundclashEnabled,
              aiVerbosity: body.aiVerbosity,
            },
            inviteHash: hash(inviteCode),
            inviteExpiresAt: new Date(Date.now() + 86400000),
          },
        ],
        { session },
      );
      await this.models.Membership.create(
        [{ loungeId: id, userId, role: "host" }],
        { session },
      );
      await this.models.Receipt.create(
        [
          {
            actorId: userId,
            commandId,
            requestHash,
            response: { loungeId: id, createdAt },
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        { session },
      );
    });
    return {
      ...(await this.snapshot(id)),
      inviteCode,
      createdAt,
    };
  }
  async join(userId, input) {
    const { inviteCode } = parse(schemas.join, input);
    const lounge = await this.models.Lounge.findOne({
      inviteHash: hash(inviteCode.toUpperCase()),
      inviteExpiresAt: { $gt: new Date() },
    });
    if (!lounge)
      throw new HttpError(
        404,
        "INVITE_NOT_FOUND",
        "Invite is invalid or expired.",
      );
    return this.serial(lounge._id, async () => {
      await this.beforeMembershipChange?.(lounge._id);
      await this.connection.transaction(async (session) => {
        const current = await this.models.Lounge.findById(lounge._id).session(
          session,
        );
        if (
          current.inviteHash !== hash(inviteCode.toUpperCase()) ||
          current.inviteExpiresAt <= new Date()
        )
          throw new HttpError(
            404,
            "INVITE_NOT_FOUND",
            "Invite is invalid or expired.",
          );
        const existing = await this.models.Membership.findOne({
          loungeId: lounge._id,
          userId,
        }).session(session);
        if (existing?.removed)
          throw new HttpError(403, "FORBIDDEN", "Membership was removed.");
        if (existing) return;
        if (current.locked || current.status === "ended")
          throw new HttpError(
            403,
            "ROOM_CLOSED",
            "This lounge is closed to new members.",
          );
        const count = await this.models.Membership.countDocuments({
          loungeId: lounge._id,
          removed: false,
        }).session(session);
        if (count >= current.settings.maxParticipants)
          throw new HttpError(
            409,
            "ROOM_FULL",
            "This lounge has reached its membership capacity.",
          );
        await this.models.Membership.create(
          [{ loungeId: lounge._id, userId, role: "listener" }],
          { session },
        );
        await this.models.Lounge.updateOne(
          { _id: lounge._id },
          { $inc: { revision: 1 } },
          { session },
        );
      });
      await this.afterMembershipChange?.(lounge._id);
      const state = await this.snapshot(lounge._id);
      this.publish(state);
      return state;
    });
  }
}
