import { randomUUID, createHmac } from "node:crypto";
import { z } from "zod";
import { RoomService as FoundationRooms } from "./rooms.js";
import { hash } from "./auth.js";
import { HttpError, requireId } from "./validation.js";
import { EventWriter } from "./event-writer.js";
import { aiCommand } from "./room-ai.js";
import { ollamaAdapter } from "./grounding.js";
import { createThrottle } from "./throttle.js";
import { socialCommands, prepareSocial, socialTick } from "./room-social.js";
import {
  compatible,
  position,
  reduceRoom,
  REDUCER_VERSION,
} from "./queue-reducer.js";

const revision = z.number().int().nonnegative();
const id = z.string().uuid();
const commands = {
  ...socialCommands,
  "room.end": z.object({ expectedRevision: revision }).strict(),
  "interaction.record": z
    .object({
      playbackId: id,
      listenedThroughSeconds: z.number().finite().nonnegative(),
      liked: z.boolean().optional(),
    })
    .strict(),
  "ai.decision": z
    .object({
      proposalId: id,
      expectedRevision: revision,
      decision: z.enum(["approve", "reject"]),
    })
    .strict(),
  "queue.enqueue": z
    .object({ trackId: id, expectedRevision: revision })
    .strict(),
  "queue.remove": z
    .object({ entryId: id, expectedRevision: revision })
    .strict(),
  "queue.vote": z.object({ entryId: id, upvoted: z.boolean() }).strict(),
  "queue.promote": z
    .object({ entryId: id, expectedRevision: revision })
    .strict(),
  "playback.control": z
    .object({
      action: z.enum(["start", "pause", "resume", "advance"]),
      expectedRevision: revision,
    })
    .strict(),
  "room.settings": z
    .object({
      expectedRevision: revision,
      locked: z.boolean().optional(),
      vibeProfile: z.string().min(1).max(80).optional(),
      bpmTolerancePct: z.number().min(0).max(8).optional(),
      soundclashEnabled: z.boolean().optional(),
      aiVerbosity: z.enum(["brief", "normal"]).optional(),
    })
    .strict(),
  "room.invite": z.object({ expectedRevision: revision }).strict(),
  "member.update": z
    .object({
      userId: id,
      expectedRevision: revision,
      muted: z.boolean().optional(),
      removed: z.boolean().optional(),
      role: z.enum(["listener", "co_dj"]).optional(),
    })
    .strict(),
  "host.transfer": z
    .object({ userId: id, expectedRevision: revision })
    .strict(),
  "member.leave": z.object({}).strict(),
};
const bad = (code, message, status = 409) => {
  throw new HttpError(status, code, message);
};
const summary = (t) => ({
  trackId: t._id,
  title: t.title,
  artist: t.artist,
  assetId: t.assetId,
  durationSeconds: t.durationSeconds,
  profileVersion: t.profileVersion,
  acoustic: t.acoustic,
  profileStatus: t.profileStatus,
});

export class RoomService extends FoundationRooms {
  constructor(models, connection, key, options = {}) {
    super(models, connection, key);
    this.states = new Map();
    this.loading = new Map();
    this.durable = new Map();
    this.presence = new Map();
    this.grace = new Map();
    this.receipts = new Map();
    this.aiJobs = new Map();
    this.outroAttempts = new Map();
    this.aiProvider = options.aiProvider ?? ollamaAdapter(options.ollamaModel);
    this.aiTimeoutMs = options.aiTimeoutMs ?? 2300;
    this.aiMetrics = { model: 0, template: 0 };
    this.aiAllowed = createThrottle({
      limit: 12,
      windowMs: 60000,
      maxKeys: 2500,
    });
    const wall = Date.now(),
      mono = performance.now();
    this.now = options.now
      ? () => Math.floor(options.now())
      : () => Math.floor(wall + performance.now() - mono);
    this.chatAllowed = createThrottle({
      limit: 5,
      windowMs: 10000,
      maxKeys: 2500,
      now: () => this.now(),
    });
    this.reactionAllowed = createThrottle({
      limit: 20,
      windowMs: 10000,
      maxKeys: 2500,
      now: () => this.now(),
    });
    this.typingAllowed = createThrottle({
      limit: 1,
      windowMs: 1000,
      maxKeys: 2500,
      now: () => this.now(),
    });
    this.typing = new Map();
    this.notify = () => {};
    this.graceMs = options.graceMs ?? 10000;
    this.closing = false;
    this.degradedAt = null;
    this.detach = () => {};
    this.writer = new EventWriter(models, connection, {
      ...options,
      onFailure: () => {
        if (this.degradedAt === null) this.degradedAt = this.now();
        for (const state of this.states.values()) this.broadcast(state);
      },
      onDurable: (event) => {
        const state = this.states.get(event.loungeId);
        if (state?.epoch === event.epoch) {
          this.durable.set(
            event.loungeId,
            Math.max(this.durable.get(event.loungeId) || 0, event.revision),
          );
          this.broadcast(state);
        }
      },
    });
    this.tickTimer = setInterval(() => this.tick().catch(() => {}), 200);
    this.tickTimer.unref();
  }
  get healthy() {
    return (
      !this.closing &&
      !this.writer.failed &&
      this.writer.buffer.length < this.writer.maxEvents
    );
  }
  async load(id) {
    requireId(id);
    if (this.states.has(id)) return this.states.get(id);
    if (this.loading.has(id)) return this.loading.get(id);
    if (this.states.size + this.loading.size >= 50)
      bad("ROOM_LIMIT", "This instance supports 50 loaded rooms.", 503);
    const pending = this.restore(id);
    this.loading.set(id, pending);
    try {
      return await pending;
    } finally {
      this.loading.delete(id);
    }
  }
  async restore(id) {
    const base = await this.databaseSnapshot(id);
    const checkpoint = await this.models.RoomSnapshot.findOne({
      loungeId: id,
    }).lean();
    let state = checkpoint?.state;
    if (checkpoint) {
      if (checkpoint.reducerVersion !== REDUCER_VERSION)
        throw new Error("Unsupported checkpoint reducer version");
      const events = this.models.QueueEvent.find({
        loungeId: id,
        epoch: checkpoint.epoch,
        revision: { $gt: checkpoint.revision },
      })
        .sort({ revision: 1, eventSeq: 1 })
        .lean()
        .cursor();
      for await (const event of events) {
        if (event.revision !== state.revision + 1 || event.eventSeq !== 0)
          throw new Error("Durable event gap");
        state = reduceRoom(state, event);
        if (state.nowPlaying && !state.nowPlaying.paused) {
          const at = event.occurredAt.getTime();
          state.nowPlaying.offsetSeconds = position(state.nowPlaying, at);
          state.nowPlaying.startedAt = at;
        }
        if (event.receipt)
          state.recentCommands = [
            ...(state.recentCommands || []),
            event.receipt,
          ].slice(-256);
      }
    } else
      state = {
        ...base,
        enqueueSequence: 0,
        reservedEntryId: null,
        recentCommands: [],
      };
    const recoveredRevision = state.revision;
    state = {
      ...state,
      members: base.members,
      hostUserId: base.hostUserId,
      settings: base.settings,
      locked: base.locked,
      vibeProfile: base.vibeProfile,
      epoch: randomUUID(),
      presentUserIds: [],
      hostConnected: false,
      mutationFrozen: true,
      segueProposal: null,
      listeningMeters: {},
      meterAt: this.now(),
    };
    if (checkpoint) {
      state.recovery = {
        durableRevision: recoveredRevision,
        unflushedChangesMayBeLost: true,
        requiresHostResume: true,
      };
      if (state.nowPlaying) {
        state.nowPlaying = { ...state.nowPlaying, paused: true };
      } // Do not count downtime as playback.
    }
    await this.models.RoomSnapshot.updateOne(
      { loungeId: id },
      {
        $set: {
          epoch: state.epoch,
          revision: state.revision,
          reducerVersion: REDUCER_VERSION,
          state,
          persistedAt: new Date(),
        },
      },
      { upsert: true },
    );
    this.states.set(id, state);
    this.durable.set(id, state.revision);
    return state;
  }
  view(state) {
    // Strip server-only data before the expensive deep copy. In particular,
    // actor-bound receipts can contain large answers that never go to the room.
    const publicState = { ...state };
    delete publicState.listeningMeters;
    delete publicState.meterAt;
    delete publicState.recentCommands;
    delete publicState.sentimentSamples;
    const copy = structuredClone(publicState);
    copy.durableRevision = this.durable.get(state.loungeId) || 0;
    copy.degraded = this.writer.failed || this.degradedAt !== null;
    copy.mutationFrozen ||= copy.degraded;
    if (copy.degraded && copy.nowPlaying) {
      copy.nowPlaying.offsetSeconds = position(
        copy.nowPlaying,
        this.degradedAt ?? this.now(),
      );
      copy.nowPlaying.paused = true;
    }
    copy.participantCount = copy.presentUserIds.length;
    copy.nextUp = copy.nextUp.map((e, i) => ({
      ...e,
      position: i,
      voteCount: e.voters.length,
    }));
    copy.serverTime = this.now();
    return copy;
  }
  async snapshot(id) {
    return this.view(await this.load(id));
  }
  broadcast(state) {
    this.publish(this.view(state));
  }
  roomMember(state, userId, roles) {
    const m = state.members.find((m) => m.userId === userId);
    if (!m || (roles && !roles.includes(m.role)))
      bad("FORBIDDEN", "This action is not available to your role.", 403);
    return m;
  }
  unmutedMember(state, userId) {
    const member = this.roomMember(state, userId);
    if (member.muted) bad("MEMBER_MUTED", "This member is muted.", 403);
    return member;
  }
  ensureWritable() {
    if (this.writer.buffer.length >= this.writer.maxEvents)
      this.degradedAt ??= this.now();
    if (
      this.closing ||
      this.writer.failed ||
      this.writer.buffer.length >= this.writer.maxEvents
    )
      bad(
        "PERSISTENCE_UNAVAILABLE",
        "Room persistence is unavailable. Try again after recovery.",
        503,
      );
  }
  commit(
    state,
    type,
    payload,
    actorId = null,
    commandId = randomUUID(),
    receipt = null,
  ) {
    this.ensureWritable();
    const event = {
      loungeId: state.loungeId,
      epoch: state.epoch,
      revision: state.revision + 1,
      eventSeq: 0,
      commandId,
      actorId,
      type,
      payload,
      reducerVersion: REDUCER_VERSION,
      occurredAt: new Date(this.now()),
    };
    let next = reduceRoom(state, event);
    if (receipt) {
      event.receipt = { ...receipt, revision: next.revision };
      next.recentCommands = [
        ...(next.recentCommands || []),
        event.receipt,
      ].slice(-256);
    }
    this.writer.append(event, next);
    this.states.set(state.loungeId, next);
    this.broadcast(next);
    if (type === "chat.reaction")
      this.notify(state.loungeId, "lounge.chat.reaction", {
        ...payload,
        count: payload.reactions[payload.emoji].length,
        epoch: next.epoch,
        revision: next.revision,
      });
    return next;
  }
  async beforeMembershipChange(id) {
    await this.load(id);
    this.ensureWritable();
  }
  async afterMembershipChange(id) {
    const base = await this.databaseSnapshot(id),
      state = await this.load(id);
    if (
      JSON.stringify(base.members) !== JSON.stringify(state.members) ||
      base.hostUserId !== state.hostUserId
    )
      this.commit(state, "room.members", {
        members: base.members,
        hostUserId: base.hostUserId,
      });
  }
  async command(loungeId, userId, type, input, commandId = randomUUID()) {
    requireId(commandId);
    requireId(loungeId);
    if (["ai.segue", "ai.question"].includes(type))
      return aiCommand(this, loungeId, userId, type, input, commandId);
    if (!commands[type]) bad("INVALID_COMMAND", "Unknown room command.", 422);
    const body = commands[type].parse(input);
    return this.serial(loungeId, async () => {
      let state = await this.load(loungeId);
      const member = this.roomMember(state, userId);
      const requestHash = hash(JSON.stringify({ type, body }));
      const prior = (state.recentCommands || []).find(
        (r) => r.actorId === userId && r.commandId === commandId,
      );
      const rotatedCode = () =>
        createHmac("sha256", this.receiptKey)
          .update(`rotate:${loungeId}:${userId}:${commandId}`)
          .digest("hex")
          .slice(0, 16)
          .toUpperCase();
      if (prior) {
        if (prior.requestHash !== requestHash)
          bad(
            "COMMAND_CONFLICT",
            "Command ID reused with a different payload.",
          );
        return this.ack(state, {
          ...prior.result,
          ...(type === "room.invite" ? { inviteCode: rotatedCode() } : {}),
        });
      }
      this.ensureWritable();
      if (this.degradedAt !== null) {
        bad(
          "PERSISTENCE_RECOVERING",
          "Waiting for safe playback checkpoint.",
          503,
        );
      }
      if (
        body.expectedRevision !== undefined &&
        body.expectedRevision !== state.revision
      )
        bad("STALE_REVISION", "Room changed. Refresh and try again.");
      if (state.status === "ended")
        bad("ROOM_ENDED", "This session has ended.");
      const hostOnly = [
        "room.end",
        "room.settings",
        "room.invite",
        "member.update",
        "host.transfer",
      ];
      if (hostOnly.includes(type)) this.roomMember(state, userId, ["host"]);
      if (
        (type.startsWith("queue.") && type !== "queue.vote") ||
        type === "playback.control" ||
        type === "ai.decision"
      )
        this.roomMember(state, userId, ["host", "co_dj"]);
      if (
        (type.startsWith("queue.") ||
          type === "playback.control" ||
          type === "ai.decision") &&
        (state.mutationFrozen || !this.hasSockets(loungeId, state.hostUserId))
      )
        bad(
          "HOST_DISCONNECTED",
          "Host disconnected. Queue mutations are frozen.",
        );
      if (
        state.recovery?.requiresHostResume &&
        type === "playback.control" &&
        member.role !== "host"
      )
        bad(
          "HOST_RESUME_REQUIRED",
          "The Host must resume after recovery.",
          403,
        );
      let eventType = type,
        payload = { ...body },
        result = {};
      delete payload.expectedRevision;
      if (
        state.battleReservedEntryId &&
        state.reservedEntryId === state.battleReservedEntryId &&
        (type === "queue.promote" ||
          (type === "ai.decision" && body.decision === "approve"))
      )
        bad(
          "BATTLE_RESERVED",
          "Advance or remove the reserved battle winner first.",
        );
      if (type === "room.end") {
        await this.writer.flush();
        payload = {};
      }
      if (type === "interaction.record") {
        const p = state.nowPlaying,
          now = this.now();
        if (
          !p ||
          p.playbackId !== body.playbackId ||
          !this.hasSockets(loungeId, userId)
        )
          bad("PLAYBACK_UNAVAILABLE", "Join the current playback first.");
        const previous = state.listeningMeters?.[userId]?.hydrated
          ? null
          : await this.models.Interaction.findOne({
              loungeId,
              userId,
              playbackId: p.playbackId,
            }).lean();
        const m = structuredClone(
          state.listeningMeters?.[userId] || {
            available: 0,
            credited: 0,
            liked: false,
            lastAt: now,
          },
        );
        if (!m.hydrated && previous) {
          m.available += previous.playedSeconds;
          m.credited = previous.playedSeconds;
          m.liked = previous.liked;
        }
        const delta = p.paused
          ? 0
          : Math.max(0, position(p, now) - position(p, state.meterAt ?? now));
        const credit = Math.min(
          15,
          Math.max(0, (now - m.lastAt) / 1000),
          Math.max(0, m.available + delta - m.credited),
          body.listenedThroughSeconds,
        );
        const playedSeconds = Math.min(p.durationSeconds, m.credited + credit);
        payload = {
          interaction: {
            loungeId,
            userId,
            playbackId: p.playbackId,
            trackId: p.trackId,
            playedSeconds,
            observedAt: new Date(now).toISOString(),
            completed: playedSeconds >= 0.8 * p.durationSeconds,
            liked: body.liked ?? m.liked ?? false,
            acoustic: p.acoustic,
            revision: state.revision + 1,
          },
          meter: {
            hydrated: true,
            available:
              body.listenedThroughSeconds === 0
                ? m.available + delta
                : playedSeconds,
            credited: playedSeconds,
            liked: body.liked ?? m.liked ?? false,
            lastAt: body.listenedThroughSeconds === 0 ? m.lastAt : now,
          },
        };
        result = { interaction: payload.interaction };
      }
      if (socialCommands[type]) {
        const social = await prepareSocial(this, state, userId, type, body);
        eventType = social.type || type;
        payload = social.payload;
        result = social.result || {};
      }
      if (type === "ai.decision") {
        const p = state.segueProposal;
        if (!p || p.proposalId !== body.proposalId || p.status !== "pending")
          bad("PROPOSAL_UNAVAILABLE", "Request a new segue proposal.");
        if (body.decision === "approve") {
          if (
            p.epoch !== state.epoch ||
            p.revision !== state.revision ||
            p.playbackId !== state.nowPlaying?.playbackId
          )
            bad("STALE_PROPOSAL", "Room changed. Request a new proposal.");
          const current = await this.track(p.currentTrackId),
            selected = await this.track(p.selectedTrackId);
          if (
            current.profileVersion !== p.currentProfileVersion ||
            selected.profileVersion !== p.selectedProfileVersion ||
            !state.nextUp.some(
              (e) => e.entryId === p.entryId && e.trackId === p.selectedTrackId,
            )
          )
            bad(
              "STALE_PROPOSAL",
              "Profiles or queue changed. Request a new proposal.",
            );
          await this.eligible(state, p.selectedTrackId);
          if (!selected.assetId)
            bad("AUDIO_UNAVAILABLE", "This track has no playable local audio.");
        }
      }
      if (type === "queue.enqueue") {
        payload = {
          entryId: randomUUID(),
          track: await this.track(body.trackId),
        };
        result.entryId = payload.entryId;
      }
      if (type === "queue.promote") {
        const e = state.nextUp.find((e) => e.entryId === body.entryId);
        if (!e) bad("ENTRY_NOT_FOUND", "Queue entry no longer exists.", 404);
        await this.eligible(state, e.trackId);
      }
      if (type === "playback.control") {
        const now = this.now();
        payload = { now };
        if (["start", "advance"].includes(body.action)) {
          if (body.action === "start" && state.nowPlaying)
            bad("ALREADY_STARTED", "Use Resume for an existing playback.");
          let trackId = state.seedTrackId,
            entryId;
          if (body.action === "advance") {
            const e =
              state.nextUp.find((e) => e.entryId === state.reservedEntryId) ||
              state.nextUp[0];
            if (!e) bad("QUEUE_EMPTY", "Add a compatible track first.");
            trackId = e.trackId;
            entryId = e.entryId;
            await this.eligible(state, trackId);
          }
          const track = await this.track(trackId);
          if (!track.assetId)
            bad("AUDIO_UNAVAILABLE", "This track has no playable local audio.");
          payload = {
            now,
            track,
            playbackId: randomUUID(),
            ...(entryId ? { entryId } : {}),
          };
          eventType = "playback.start";
        } else {
          if (!state.nowPlaying) bad("NOT_PLAYING", "Start a track first.");
          if (
            body.action === "resume" &&
            position(state.nowPlaying, now) >= state.nowPlaying.durationSeconds
          )
            bad("TRACK_ENDED", "Advance to a compatible track.");
          eventType = `playback.${body.action}`;
        }
      }
      if (type === "room.settings") {
        const { locked, vibeProfile, ...settings } = payload;
        const fields = {};
        for (const [k, v] of Object.entries(settings))
          fields[`settings.${k}`] = v;
        if (locked !== undefined) fields.locked = locked;
        if (vibeProfile !== undefined) fields.vibeProfile = vibeProfile;
        await this.models.Lounge.updateOne({ _id: loungeId }, { $set: fields });
        payload = {
          settings,
          ...(locked !== undefined ? { locked } : {}),
          ...(vibeProfile !== undefined ? { vibeProfile } : {}),
        };
      }
      if (type === "room.invite") {
        result = {
          inviteCode: rotatedCode(),
          expiresAt: new Date(this.now() + 86400000).toISOString(),
        };
        await this.models.Lounge.updateOne(
          { _id: loungeId },
          {
            $set: {
              inviteHash: hash(result.inviteCode),
              inviteExpiresAt: new Date(result.expiresAt),
            },
          },
        );
        payload = {};
      }
      if (["member.update", "host.transfer", "member.leave"].includes(type)) {
        const target = type === "member.leave" ? userId : body.userId;
        this.roomMember(state, target);
        if (type === "member.update" && target === state.hostUserId)
          bad("HOST_PROTECTED", "Use host transfer before changing the Host.");
        if (
          type === "host.transfer" &&
          (target === userId || !this.hasSockets(loungeId, target))
        )
          bad(
            "TARGET_OFFLINE",
            "Transfer requires a different connected member.",
          );
        await this.connection.transaction(async (session) => {
          if (type === "host.transfer") {
            await this.models.Membership.updateOne(
              { loungeId, userId },
              { $set: { role: "co_dj" } },
              { session },
            );
            await this.models.Membership.updateOne(
              { loungeId, userId: target },
              { $set: { role: "host" } },
              { session },
            );
            await this.models.Lounge.updateOne(
              { _id: loungeId },
              { $set: { hostUserId: target } },
              { session },
            );
          } else if (type === "member.update") {
            const { userId: ignored, ...fields } = payload;
            void ignored;
            await this.models.Membership.updateOne(
              { loungeId, userId: target },
              { $set: fields },
              { session },
            );
          }
          // Leaving detaches presence but preserves membership and the ability to rejoin.
        });
        const base = await this.databaseSnapshot(loungeId);
        eventType = "room.members";
        payload = { members: base.members, hostUserId: base.hostUserId };
        if (type === "member.leave" || body.removed)
          this.detach(loungeId, target);
      }
      const receiptResult = { ...result };
      delete receiptResult.inviteCode;
      state = this.commit(state, eventType, payload, userId, commandId, {
        actorId: userId,
        commandId,
        requestHash,
        result: receiptResult,
      });
      if (type === "host.transfer" || type === "member.leave" || body.removed)
        state = await this.updatePresence(loungeId);
      if (type === "room.end") {
        await this.writer.flush();
        result.summaryStatus = "complete";
      }
      return this.ack(state, result);
    });
  }
  ack(state, result = {}) {
    return {
      ok: true,
      epoch: state.epoch,
      revision: state.revision,
      durableRevision: this.durable.get(state.loungeId) || 0,
      ...result,
    };
  }
  async setTyping(loungeId, userId, input) {
    const body = z.object({ active: z.boolean() }).strict().parse(input);
    return this.serial(loungeId, async () => {
      const state = await this.load(loungeId);
      this.unmutedMember(state, userId);
      const key = `${loungeId}:${userId}`;
      if (!this.typingAllowed(key)) return this.ack(state);
      if (body.active)
        this.typing.set(key, {
          loungeId,
          userId,
          expiresAt: this.now() + 3000,
        });
      else this.typing.delete(key);
      this.notify(loungeId, "lounge.chat.typing", {
        userId,
        active: body.active,
        expiresAt: this.now() + 3000,
      });
      return this.ack(state);
    });
  }
  async chatHistory(loungeId, userId, cursor) {
    return this.serial(loungeId, async () => {
      const state = await this.load(loungeId);
      this.roomMember(state, userId);
      let before = Infinity;
      if (cursor) {
        requireId(cursor);
        const anchor = await this.models.ChatMessage.findOne({
          loungeId,
          messageId: cursor,
        }).lean();
        if (!anchor)
          bad("INVALID_CURSOR", "History cursor is unavailable.", 422);
        before = anchor.revision;
      }
      const rows = await this.models.ChatMessage.find({
        loungeId,
        ...(Number.isFinite(before) ? { revision: { $lt: before } } : {}),
      })
        .sort({ revision: -1 })
        .limit(51)
        .lean();
      for (const row of rows)
        for (const { event } of this.writer.buffer)
          if (
            event.loungeId === loungeId &&
            event.type === "chat.reaction" &&
            event.payload.messageId === row.messageId
          )
            row.reactions = event.payload.reactions;
      return {
        items: rows.slice(0, 50).reverse(),
        nextCursor: rows.length > 50 ? rows[49].messageId : null,
      };
    });
  }
  async track(id) {
    const t = await this.models.Track.findById(id).lean();
    if (!t) bad("INVALID_TRACK", "Choose a catalog track.", 422);
    return summary(t);
  }
  async eligible(state, trackId) {
    const a = await this.track(state.nowPlaying?.trackId || state.seedTrackId),
      b = await this.track(trackId);
    if (
      a.profileStatus !== "ready" ||
      b.profileStatus !== "ready" ||
      !compatible(a.acoustic, b.acoustic, state.settings.bpmTolerancePct)
    )
      bad(
        "INCOMPATIBLE_TRACK",
        "Verified BPM and Camelot profiles must both be compatible.",
      );
    return b;
  }
  hasSockets(id, userId) {
    return (this.presence.get(id)?.get(userId)?.size || 0) > 0;
  }
  async attach(id, userId, socketId) {
    const state = await this.load(id);
    this.roomMember(state, userId);
    let users = this.presence.get(id);
    if (!users) {
      users = new Map();
      this.presence.set(id, users);
    }
    if (!users.has(userId)) users.set(userId, new Set());
    if (users.get(userId).size >= 8 && !users.get(userId).has(socketId))
      bad("TAB_LIMIT", "Close another lounge tab before connecting.", 429);
    users.get(userId).add(socketId);
    const key = `${id}:${userId}`;
    clearTimeout(this.grace.get(key));
    this.grace.delete(key);
    return this.updatePresence(id);
  }
  disconnected(id, userId, socketId, immediate = false) {
    const sockets = this.presence.get(id)?.get(userId);
    sockets?.delete(socketId);
    if (sockets?.size) return Promise.resolve();
    return this.serial(id, async () => {
      const state = await this.load(id);
      if (this.hasSockets(id, userId)) return;
      const key = `${id}:${userId}`;
      if (immediate) {
        clearTimeout(this.grace.get(key));
        this.grace.delete(key);
        this.presence.get(id)?.delete(userId);
      } else if (!this.grace.has(key)) {
        const timer = setTimeout(() => {
          this.grace.delete(key);
          this.serial(id, async () => {
            if (!this.hasSockets(id, userId)) {
              this.presence.get(id)?.delete(userId);
              await this.updatePresence(id);
            }
          }).catch(() => {});
        }, this.graceMs);
        timer.unref();
        this.grace.set(key, timer);
      }
      if (immediate || state.hostUserId === userId)
        await this.updatePresence(id);
    });
  }
  async updatePresence(id) {
    const state = await this.load(id);
    const userIds = [...(this.presence.get(id)?.keys() || [])]
      .filter((id) => state.members.some((m) => m.userId === id))
      .sort();
    const hostConnected = this.hasSockets(id, state.hostUserId);
    if (
      JSON.stringify(userIds) === JSON.stringify(state.presentUserIds) &&
      hostConnected === state.hostConnected
    )
      return state;
    if (
      this.writer.failed ||
      this.writer.buffer.length >= this.writer.maxEvents
    ) {
      this.degradedAt ??= this.now();
      this.broadcast(state);
      return state;
    }
    return this.commit(state, "presence.set", {
      userIds,
      hostConnected,
      now: this.now(),
    });
  }
  async tick() {
    if (this.closing) return;
    for (const [key, value] of this.typing) {
      const member = this.states
        .get(value.loungeId)
        ?.members.find((m) => m.userId === value.userId);
      if (
        value.expiresAt <= this.now() ||
        !member ||
        member.muted ||
        !this.hasSockets(value.loungeId, value.userId)
      ) {
        this.typing.delete(key);
        this.notify(value.loungeId, "lounge.chat.typing", {
          userId: value.userId,
          active: false,
        });
      }
    }
    if (
      !this.writer.failed &&
      this.writer.buffer.length === 0 &&
      this.degradedAt !== null
    ) {
      const pausedAt = this.degradedAt;
      for (const id of this.states.keys())
        await this.serial(id, async () => {
          const s = this.states.get(id);
          if (s.nowPlaying) this.commit(s, "playback.pause", { now: pausedAt });
          await this.afterMembershipChange(id);
          const base = await this.databaseSnapshot(id),
            current = this.states.get(id);
          if (
            JSON.stringify(base.settings) !==
              JSON.stringify(current.settings) ||
            base.locked !== current.locked ||
            base.vibeProfile !== current.vibeProfile
          )
            this.commit(current, "room.settings", {
              settings: base.settings,
              locked: base.locked,
              vibeProfile: base.vibeProfile,
            });
          await this.updatePresence(id);
        });
      this.degradedAt = null;
      for (const s of this.states.values()) this.broadcast(s);
    }
    for (const id of this.states.keys())
      await this.serial(id, async () => {
        if (this.states.get(id).status === "ended") return;
        const s = await socialTick(this, this.states.get(id));
        if (
          this.healthy &&
          this.degradedAt === null &&
          !s.mutationFrozen &&
          s.nowPlaying &&
          !s.nowPlaying.paused &&
          position(s.nowPlaying, this.now()) >=
            Math.max(0, s.nowPlaying.durationSeconds - 10) &&
          this.outroAttempts.get(id) !== s.nowPlaying.playbackId
        ) {
          this.outroAttempts.set(id, s.nowPlaying.playbackId);
          // Do not await a command while holding its FIFO lock.
          this.command(id, s.hostUserId, "ai.segue", {
            expectedRevision: s.revision,
          }).catch(() => {});
        }
        if (
          this.healthy &&
          this.degradedAt === null &&
          !s.mutationFrozen &&
          s.nowPlaying &&
          !s.nowPlaying.paused &&
          position(s.nowPlaying, this.now()) >= s.nowPlaying.durationSeconds
        ) {
          // Stay inside the room FIFO: simultaneous ticks cannot consume two entries.
          const entry =
            s.nextUp.find((entry) => entry.entryId === s.reservedEntryId) ||
            s.nextUp[0];
          if (entry) {
            try {
              const track = await this.eligible(s, entry.trackId);
              if (track.assetId) {
                this.commit(s, "playback.start", {
                  now: this.now(),
                  track,
                  entryId: entry.entryId,
                  playbackId: randomUUID(),
                });
                return;
              }
            } catch (error) {
              if (
                !(error instanceof HttpError) ||
                !["INCOMPATIBLE_TRACK", "INVALID_TRACK"].includes(error.code)
              )
                throw error;
            }
          }
          // Keep a blocked head/reservation in place; never silently skip it.
          this.commit(s, "playback.pause", { now: this.now() });
        }
      });
  }
  async close({ flush = true } = {}) {
    this.closing = true;
    clearInterval(this.tickTimer);
    this.writer.stop();
    await Promise.allSettled(
      [...this.aiJobs.values()].map((job) => job.promise),
    );
    for (const timer of this.grace.values()) clearTimeout(timer);
    await Promise.allSettled([...this.locks.values()]);
    if (flush) await this.writer.flush();
  }
}
