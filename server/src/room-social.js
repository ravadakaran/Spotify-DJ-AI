import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "./validation.js";
import { position } from "./queue-reducer.js";
import { scoreSentiment, rollingSentiment } from "./sentiment.js";
export const EMOJIS = ["👍", "❤️", "🔥", "🎵"];
const id = z.string().uuid(),
  revision = z.number().int().nonnegative();
export const socialCommands = {
  "chat.message": z
    .object({ body: z.string().trim().min(1).max(1000) })
    .strict(),
  "chat.reaction": z
    .object({ messageId: id, emoji: z.enum(EMOJIS), active: z.boolean() })
    .strict(),
  "battle.candidate": z.object({ trackId: id }).strict(),
  "battle.open": z
    .object({
      battleId: id,
      expectedRevision: revision,
      durationSeconds: z.number().int().min(10).max(120),
    })
    .strict(),
  "battle.vote": z.object({ battleId: id, candidateId: id }).strict(),
  "battle.resolve": z
    .object({
      battleId: id,
      expectedRevision: revision,
      winnerCandidateId: id.optional(),
    })
    .strict(),
  "battle.cancel": z
    .object({ battleId: id, expectedRevision: revision })
    .strict(),
};
const fail = (code, message, status = 409) => {
  throw new HttpError(status, code, message);
};
export const leaders = (battle) => {
  const counts = battle.candidates.map(
    (c) =>
      Object.values(battle.votes).filter((id) => id === c.candidateId).length,
  );
  return battle.candidates.filter((_, i) => counts[i] === Math.max(...counts));
};
export async function resolution(service, state, winnerCandidateId) {
  const b = state.battle,
    top = leaders(b);
  if (!winnerCandidateId && top.length > 1)
    return { type: "battle.tie", payload: {} };
  const winner = top.find(
    (c) => c.candidateId === (winnerCandidateId || top[0].candidateId),
  );
  if (!winner) fail("INVALID_WINNER", "Choose one of the tied leaders.");
  const track = await service.track(winner.trackId);
  let applicationStatus = "reserved",
    reason = "Compatible winner reserved next.";
  try {
    await service.eligible(state, winner.trackId);
  } catch (e) {
    if (e.code !== "INCOMPATIBLE_TRACK") throw e;
    applicationStatus = "deferred";
    reason = "Winner deferred: BPM or Camelot profile is incompatible.";
  }
  if (!track.assetId) {
    applicationStatus = "deferred";
    reason = "Winner deferred: local audio is unavailable.";
  }
  const existing = state.nextUp.find((e) => e.trackId === winner.trackId);
  if (!existing && state.nextUp.length >= 200)
    fail("QUEUE_FULL", "Make space in Next Up before resolving this battle.");
  return {
    type: "battle.resolved",
    payload: {
      winnerCandidateId: winner.candidateId,
      winningTrackId: winner.trackId,
      applicationStatus,
      entryId: existing?.entryId || randomUUID(),
      track,
      announcement: {
        messageId: randomUUID(),
        userId: null,
        displayName: "DJ",
        msgType: "dj_announcement",
        body: `${track.title} won Soundclash. ${reason}`,
        generationMode: "template",
        createdAt: service.now(),
        tsSeconds: position(state.nowPlaying, service.now()),
        reactions: {},
      },
    },
  };
}
export async function prepareSocial(service, state, userId, type, body) {
  const now = service.now(),
    member = service.roomMember(state, userId);
  if (type.startsWith("chat.")) {
    service.unmutedMember(state, userId);
    if (
      !(
        type === "chat.message" ? service.chatAllowed : service.reactionAllowed
      )(`${state.loungeId}:${userId}`)
    )
      fail("RATE_LIMITED", "Please wait before posting again.", 429);
    if (type === "chat.message") {
      const message = {
        messageId: randomUUID(),
        userId,
        displayName: member.displayName,
        body: body.body,
        msgType: "chat",
        createdAt: now,
        tsSeconds: position(state.nowPlaying, now),
        ...scoreSentiment(body.body),
        reactions: {},
      };
      return {
        payload: { message },
        result: {
          messageId: message.messageId,
          sentimentBucket: message.sentimentBucket,
        },
      };
    }
    const message =
      (state.chat || []).find((m) => m.messageId === body.messageId) ||
      (await service.models.ChatMessage.findOne({
        loungeId: state.loungeId,
        messageId: body.messageId,
      }).lean());
    if (!message) fail("MESSAGE_NOT_FOUND", "Message not found.", 404);
    let reactions = structuredClone(message.reactions || {});
    // Older history rows can lag accepted, unflushed reactions.
    for (const { event } of service.writer.buffer)
      if (
        event.loungeId === state.loungeId &&
        event.type === "chat.reaction" &&
        event.payload.messageId === body.messageId
      )
        reactions = structuredClone(event.payload.reactions);
    const voters = (reactions[body.emoji] || []).filter((id) => id !== userId);
    if (body.active) voters.push(userId);
    reactions[body.emoji] = voters.sort();
    return { payload: { ...body, reactions } };
  }
  if (["battle.open", "battle.resolve", "battle.cancel"].includes(type))
    service.roomMember(state, userId, ["host", "co_dj"]);
  if (
    state.mutationFrozen ||
    !service.hasSockets(state.loungeId, state.hostUserId)
  )
    fail("HOST_DISCONNECTED", "Soundclash is frozen until the Host returns.");
  if (type === "battle.candidate") {
    if (!state.settings.soundclashEnabled)
      fail("BATTLES_DISABLED", "Soundclash is disabled.");
    const b = state.battle;
    if (b && ["open", "awaiting_tie"].includes(b.status))
      fail("BATTLE_ACTIVE", "Finish the active battle first.");
    const candidates = b?.status === "draft" ? b.candidates : [];
    if (
      candidates.length >= 4 ||
      candidates.some(
        (c) => c.submitterId === userId || c.trackId === body.trackId,
      )
    )
      fail(
        "CANDIDATE_LIMIT",
        "Submit one distinct track per member, up to four candidates.",
      );
    const candidate = {
      candidateId: randomUUID(),
      trackId: body.trackId,
      track: await service.track(body.trackId),
      submitterId: userId,
    };
    const battleId = b?.status === "draft" ? b.battleId : randomUUID();
    return {
      payload: { battleId, candidate },
      result: { candidateId: candidate.candidateId, battleId },
    };
  }
  const b = state.battle;
  if (!b || b.battleId !== body.battleId)
    fail("BATTLE_NOT_FOUND", "Battle not found.", 404);
  if (type === "battle.open") {
    if (
      !state.settings.soundclashEnabled ||
      b.status !== "draft" ||
      b.candidates.length < 2
    )
      fail(
        "BATTLE_NOT_READY",
        "Enable Soundclash and submit two to four candidates.",
      );
    return { payload: { closesAt: now + body.durationSeconds * 1000 } };
  }
  if (type === "battle.vote") {
    if (b.status !== "open" || now >= b.closesAt)
      fail("BATTLE_CLOSED", "Voting has closed.");
    if (!b.candidates.some((c) => c.candidateId === body.candidateId))
      fail("INVALID_CANDIDATE", "Choose a battle candidate.", 422);
    return { payload: { candidateId: body.candidateId } };
  }
  if (type === "battle.cancel") {
    if (!["draft", "open", "awaiting_tie"].includes(b.status))
      fail("BATTLE_CLOSED", "Battle already finished.");
    return { payload: {} };
  }
  if (!["open", "awaiting_tie"].includes(b.status) || now < b.closesAt)
    fail("BATTLE_NOT_DUE", "Wait until voting closes.");
  return resolution(service, state, body.winnerCandidateId);
}
export function reduceSocial(state, event) {
  const p = event.payload;
  const append = (message) => {
    state.chat = [...(state.chat || []), message].slice(-50);
  };
  switch (event.type) {
    case "chat.message":
      append(p.message);
      state.sentimentSamples ||= {};
      state.sentimentSamples[event.actorId] = {
        at: p.message.createdAt,
        score: p.message.sentimentScore,
      };
      return true;
    case "chat.reaction": {
      const m = state.chat?.find((m) => m.messageId === p.messageId);
      if (m) m.reactions = p.reactions;
      return true;
    }
    case "sentiment.tick":
      state.sentiment = p.sentiment;
      state.sentimentTickAt = p.now;
      state.sentimentSamples = Object.fromEntries(
        Object.entries(state.sentimentSamples || {}).filter(
          ([, s]) => p.now - s.at < 30000,
        ),
      );
      return true;
    case "battle.candidate":
      if (state.battle?.battleId !== p.battleId)
        state.battle = {
          battleId: p.battleId,
          status: "draft",
          candidates: [],
          votes: {},
        };
      state.battle.candidates.push(p.candidate);
      return true;
    case "battle.open":
      state.battle.status = "open";
      state.battle.closesAt = p.closesAt;
      state.battleCount = (state.battleCount || 0) + 1;
      return true;
    case "battle.vote":
      state.battle.votes[event.actorId] = p.candidateId;
      return true;
    case "battle.tie":
      state.battle.status = "awaiting_tie";
      return true;
    case "battle.cancel":
      state.battle.status = "cancelled";
      return true;
    case "battle.resolved":
      Object.assign(state.battle, {
        status: "resolved",
        winnerCandidateId: p.winnerCandidateId,
        winningTrackId: p.winningTrackId,
        applicationStatus: p.applicationStatus,
        announcement: p.announcement.body,
      });
      if (!state.nextUp.some((e) => e.entryId === p.entryId))
        state.nextUp.push({
          entryId: p.entryId,
          trackId: p.track.trackId,
          track: p.track,
          addedByUserId: event.actorId,
          enqueueSequence: ++state.enqueueSequence,
          voters: [],
        });
      if (p.applicationStatus === "reserved") {
        state.reservedEntryId = p.entryId;
        state.battleReservedEntryId = p.entryId;
      }
      append(p.announcement);
      return true;
    default:
      return false;
  }
}
export async function socialTick(service, state) {
  const now = service.now();
  if (!service.healthy || service.degradedAt !== null) return state;
  if (
    !state.mutationFrozen &&
    service.hasSockets(state.loungeId, state.hostUserId) &&
    state.settings.soundclashEnabled &&
    state.battle?.status === "draft" &&
    state.battle.candidates.length >= 2 &&
    state.nowPlaying &&
    !state.nowPlaying.paused &&
    position(state.nowPlaying, now) >=
      Math.max(0, state.nowPlaying.durationSeconds - 10)
  )
    state = service.commit(state, "battle.open", {
      closesAt: now + 30000,
      openedBy: "internal_dj",
    });
  if (
    Object.keys(state.sentimentSamples || {}).length &&
    now - (state.sentimentTickAt || 0) >= 1000
  )
    state = service.commit(state, "sentiment.tick", {
      now,
      sentiment: rollingSentiment(state.sentimentSamples, now),
    });
  if (
    !state.mutationFrozen &&
    service.hasSockets(state.loungeId, state.hostUserId) &&
    state.battle?.status === "open" &&
    now >= state.battle.closesAt
  ) {
    try {
      const result = await resolution(service, state);
      state = service.commit(state, result.type, result.payload);
    } catch (error) {
      if (error.code !== "QUEUE_FULL") throw error;
    }
  }
  return state;
}
