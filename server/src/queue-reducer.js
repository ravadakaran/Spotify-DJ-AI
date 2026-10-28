import { HttpError } from "./validation.js";
import { reduceSocial } from "./room-social.js";

export const REDUCER_VERSION = 1;
export const queueOrder = (a, b) =>
  b.voters.length - a.voters.length ||
  a.enqueueSequence - b.enqueueSequence ||
  a.entryId.localeCompare(b.entryId);
export function compatible(a, b, tolerance = 8) {
  if (
    !a ||
    !b ||
    !Number.isFinite(a.bpm) ||
    !Number.isFinite(b.bpm) ||
    a.bpm <= 0 ||
    b.bpm <= 0 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    tolerance > 8
  )
    return false;
  const parse = (key) =>
    /^(?:[1-9]|1[0-2])[AB]$/.test(key)
      ? [Number(key.slice(0, -1)), key.slice(-1)]
      : null;
  const x = parse(a.camelotKey),
    y = parse(b.camelotKey);
  if (!x || !y) return false;
  const distance = (x[0] - y[0] + 12) % 12;
  const harmonic =
    x[0] === y[0] || (x[1] === y[1] && [1, 11].includes(distance));
  return (
    harmonic &&
    [0.5, 1, 2].some(
      (m) => Math.abs(b.bpm / (a.bpm * m) - 1) <= tolerance / 100 + 1e-10,
    )
  );
}
export function position(playback, now) {
  if (!playback) return 0;
  return Math.min(
    playback.durationSeconds,
    playback.offsetSeconds +
      (playback.paused ? 0 : Math.max(0, now - playback.startedAt) / 1000),
  );
}
export function reduceRoom(previous, event) {
  if (event.reducerVersion !== REDUCER_VERSION)
    throw new Error("Unsupported reducer version");
  // Receipts are append-only: commit/replay replace their array, never mutate
  // its entries. Share that private history while cloning mutable room state.
  const { recentCommands, ...mutableState } = previous;
  const state = structuredClone(mutableState),
    p = event.payload;
  if (recentCommands !== undefined) state.recentCommands = recentCommands;
  const entry = () => {
    const value = state.nextUp.find((e) => e.entryId === p.entryId);
    if (!value)
      throw new HttpError(
        404,
        "ENTRY_NOT_FOUND",
        "Queue entry no longer exists.",
      );
    return value;
  };
  const at = new Date(event.occurredAt).getTime();
  const meters = (state.listeningMeters ??= {});
  if (
    state.nowPlaying &&
    !state.nowPlaying.paused &&
    state.status !== "ended"
  ) {
    const delta = Math.max(
      0,
      position(state.nowPlaying, at) -
        position(state.nowPlaying, state.meterAt ?? at),
    );
    for (const userId of state.presentUserIds || []) {
      const m = (meters[userId] ??= { available: 0, credited: 0, lastAt: at });
      m.available += delta;
    }
  }
  state.meterAt = at;
  switch (event.type) {
    case "interaction.record":
      state.listeningMeters[event.actorId] = p.meter;
      break;
    case "room.end":
      state.status = "ended";
      state.summaryStatus = "pending";
      state.endedAt = at;
      state.segueProposal = null;
      if (
        state.battle &&
        ["open", "draft", "tied"].includes(state.battle.status)
      )
        state.battle.status = "cancelled";
      if (state.nowPlaying) {
        state.nowPlaying.offsetSeconds = position(state.nowPlaying, at);
        state.nowPlaying.paused = true;
      }
      break;
    case "ai.segue":
      state.segueProposal = p.proposal;
      break;
    case "ai.question":
      state.questionCount = (state.questionCount || 0) + 1;
      break;
    case "ai.decision":
      state.segueProposal.status =
        p.decision === "approve" ? "approved" : "rejected";
      if (p.decision === "approve")
        state.reservedEntryId = state.segueProposal.entryId;
      break;
    case "queue.enqueue":
      if (state.nextUp.length >= 200)
        throw new HttpError(409, "QUEUE_FULL", "Queue limit is 200 entries.");
      state.enqueueSequence++;
      state.nextUp.push({
        entryId: p.entryId,
        trackId: p.track.trackId,
        track: p.track,
        addedByUserId: event.actorId,
        enqueueSequence: state.enqueueSequence,
        voters: [],
      });
      break;
    case "queue.remove":
      entry();
      state.nextUp = state.nextUp.filter((e) => e.entryId !== p.entryId);
      if (state.reservedEntryId === p.entryId) state.reservedEntryId = null;
      if (state.battleReservedEntryId === p.entryId)
        state.battleReservedEntryId = null;
      break;
    case "queue.vote": {
      const e = entry();
      e.voters = e.voters.filter((id) => id !== event.actorId);
      if (p.upvoted) e.voters.push(event.actorId);
      e.voters.sort();
      break;
    }
    case "queue.promote":
      entry();
      state.reservedEntryId = p.entryId;
      break;
    case "playback.start":
      state.listeningMeters = {};
      state.meterAt = at;
      state.recentTrackIds = [
        ...(state.recentTrackIds || []),
        ...(state.nowPlaying ? [state.nowPlaying.trackId] : []),
      ].slice(-5);
      state.segueProposal = null;
      state.nowPlaying = {
        ...p.track,
        playbackId: p.playbackId,
        paused: false,
        offsetSeconds: 0,
        startedAt: p.now,
      };
      state.status = "live";
      state.recovery = null;
      if (p.entryId)
        state.nextUp = state.nextUp.filter((e) => e.entryId !== p.entryId);
      state.reservedEntryId = null;
      state.battleReservedEntryId = null;
      break;
    case "playback.pause":
      if (state.nowPlaying) {
        state.nowPlaying.offsetSeconds = position(state.nowPlaying, p.now);
        state.nowPlaying.paused = true;
      }
      break;
    case "playback.resume":
      if (state.nowPlaying) {
        state.nowPlaying.paused = false;
        state.nowPlaying.startedAt = p.now;
      }
      state.recovery = null;
      break;
    case "room.members":
      state.members = p.members;
      state.hostUserId = p.hostUserId;
      break;
    case "room.settings":
      state.settings = { ...state.settings, ...p.settings };
      if (p.locked !== undefined) state.locked = p.locked;
      if (p.vibeProfile !== undefined) state.vibeProfile = p.vibeProfile;
      break;
    case "presence.set":
      for (const [userId, m] of Object.entries(state.listeningMeters || {})) {
        if (
          !p.userIds.includes(userId) ||
          !(state.presentUserIds || []).includes(userId)
        ) {
          m.available = m.credited;
          m.lastAt = at;
        }
      }
      state.presentUserIds = p.userIds;
      state.hostConnected = p.hostConnected;
      state.mutationFrozen = !p.hostConnected;
      if (!p.hostConnected && state.nowPlaying) {
        state.nowPlaying.offsetSeconds = position(state.nowPlaying, p.now);
        state.nowPlaying.paused = true;
      }
      break;
    case "room.invite":
      break;
    default:
      if (!reduceSocial(state, event))
        throw new Error(`Unknown reducer event: ${event.type}`);
  }
  state.nextUp.sort(queueOrder);
  state.revision = event.revision;
  state.lastEventType = event.type;
  state.epoch = event.epoch;
  return state;
}
