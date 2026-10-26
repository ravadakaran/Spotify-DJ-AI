import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hash } from "./auth.js";
import { HttpError } from "./validation.js";
import { position } from "./queue-reducer.js";
import { rank } from "./music-engine.js";
import { generate, retrieve } from "./grounding.js";

const revision = z.number().int().nonnegative();
const schemas = {
  "ai.segue": z.object({ expectedRevision: revision }).strict(),
  "ai.question": z
    .object({ trackId: z.uuid(), question: z.string().trim().min(1).max(500) })
    .strict(),
};
const fail = (code, message, status = 409) => {
  throw new HttpError(status, code, message);
};
const trackSummary = (t) => ({ ...t, trackId: t._id });

// Generation runs outside the room FIFO. Both admission and publication use it.
export async function aiCommand(
  service,
  loungeId,
  userId,
  type,
  input,
  commandId,
) {
  const body = schemas[type].parse(input);
  const requestHash = hash(JSON.stringify({ type, body }));
  const key = `${loungeId}:${userId}:${commandId}`;
  const pending = service.aiJobs.get(key);
  if (pending) {
    if (pending.requestHash !== requestHash)
      fail("COMMAND_CONFLICT", "Command ID reused with a different payload.");
    return pending.promise;
  }
  if (service.aiJobs.size >= 8)
    fail("AI_BUSY", "Generation capacity reached. Try again shortly.", 429);
  const promise = execute();
  service.aiJobs.set(key, { promise, requestHash });
  try {
    return await promise;
  } finally {
    service.aiJobs.delete(key);
  }

  async function execute() {
    const captured = await service.serial(loungeId, async () => {
      const state = await service.load(loungeId);
      service.roomMember(
        state,
        userId,
        type === "ai.segue" ? ["host", "co_dj"] : undefined,
      );
      const prior = (state.recentCommands || []).find(
        (r) => r.actorId === userId && r.commandId === commandId,
      );
      if (prior) {
        if (prior.requestHash !== requestHash)
          fail(
            "COMMAND_CONFLICT",
            "Command ID reused with a different payload.",
          );
        return { prior: service.ack(state, prior.result) };
      }
      if (!service.aiAllowed(`${loungeId}:${userId}`))
        fail(
          "AI_RATE_LIMIT",
          "Limit is 12 AI requests per minute per member.",
          429,
        );
      service.ensureWritable();
      if (
        state.mutationFrozen ||
        !service.hasSockets(loungeId, state.hostUserId) ||
        service.degradedAt !== null
      )
        fail("HOST_DISCONNECTED", "Room is frozen.");
      if (
        body.expectedRevision !== undefined &&
        body.expectedRevision !== state.revision
      )
        fail("STALE_REVISION", "Refresh the room and try again.");
      if (type === "ai.question") {
        if (
          ![
            state.nowPlaying?.trackId,
            ...(state.recentTrackIds || []),
          ].includes(body.trackId)
        )
          fail(
            "TRACK_NOT_IN_CONTEXT",
            "Ask about the current or five recent tracks.",
            422,
          );
        const track = await service.models.Track.findById(body.trackId).lean();
        if (!track) fail("INVALID_TRACK", "Track unavailable.", 422);
        return {
          state,
          tracks: [track],
          context: retrieve(
            track,
            body.question,
            position(state.nowPlaying, service.now()),
          ),
        };
      }
      if (!state.nowPlaying)
        fail("NOT_PLAYING", "Start playback before requesting a segue.");
      const tracks = await service.models.Track.find({
        _id: {
          $in: [
            state.nowPlaying.trackId,
            ...state.nextUp.map((e) => e.trackId),
          ],
        },
      }).lean();
      const current = tracks.find((t) => t._id === state.nowPlaying.trackId);
      const entries = state.nextUp
        .map((e) => ({ ...e, track: tracks.find((t) => t._id === e.trackId) }))
        .filter((e) => e.track?.assetId)
        .map((e) => ({ ...e, track: trackSummary(e.track) }));
      const selected = rank(current && trackSummary(current), entries, {
        tolerance: state.settings.bpmTolerancePct,
        sentiment: state.sentiment?.score || 0,
        recent: state.recentTrackIds || [],
        reservedEntryId: state.reservedEntryId,
      })[0];
      const context = selected
        ? retrieve(selected.track, "BPM tempo Camelot key energy", 0)
        : [];
      return { state, tracks, selected, context };
    });
    if (captured.prior) return captured.prior;
    const started = performance.now();
    const generated = await generate(
      captured.context,
      body.question || "Describe the next track acoustic profile.",
      service.aiProvider,
      service.aiTimeoutMs,
    );
    return service.serial(loungeId, async () => {
      const state = await service.load(loungeId);
      service.roomMember(
        state,
        userId,
        type === "ai.segue" ? ["host", "co_dj"] : undefined,
      );
      service.ensureWritable();
      if (
        state.epoch !== captured.state.epoch ||
        state.revision !== captured.state.revision ||
        state.mutationFrozen ||
        service.degradedAt !== null ||
        !service.hasSockets(loungeId, state.hostUserId)
      )
        fail(
          "STALE_GENERATION",
          "Room changed during generation. Request again.",
        );
      const latest = await service.models.Track.find({
        _id: { $in: captured.tracks.map((t) => t._id) },
      }).lean();
      if (
        latest.length !== captured.tracks.length ||
        captured.tracks.some(
          (t) =>
            latest.find((n) => n._id === t._id)?.profileVersion !==
            t.profileVersion,
        )
      )
        fail("STALE_GENERATION", "Track profiles changed during generation.");
      let result, payload;
      if (type === "ai.question") {
        result = {
          ...generated,
          trackId: body.trackId,
          profileVersion: captured.tracks[0].profileVersion,
        };
        // Answers live only in actor-bound receipts, stripped from public snapshots.
        payload = {
          trackId: body.trackId,
          generationMode: generated.generationMode,
          insufficientMetadata: generated.insufficientMetadata,
        };
      } else {
        const selected = captured.selected;
        const proposal = {
          proposalId: randomUUID(),
          epoch: state.epoch,
          revision: state.revision + 1,
          currentTrackId: state.nowPlaying.trackId,
          playbackId: state.nowPlaying.playbackId,
          currentProfileVersion: captured.tracks.find(
            (t) => t._id === state.nowPlaying.trackId,
          )?.profileVersion,
          selectedTrackId: selected?.trackId || null,
          entryId: selected?.entryId || null,
          selectedProfileVersion: selected?.track.profileVersion || null,
          matchReason: selected?.matchReason || null,
          score: selected?.score || null,
          reason: selected ? null : "NO_COMPATIBLE_TRACK",
          status: selected ? "pending" : "unavailable",
          transitionScript: selected
            ? `Next: ${selected.track.title}. The tempo and ${selected.matchReason.camelotRelation} Camelot key pass the room's compatibility rules. ${generated.answer}`
            : "No compatible playable track. Playback will pause at the end.",
          sourceEvents: generated.sourceEvents,
          citations: generated.citations,
          generationMode: generated.generationMode,
          fallbackReason: generated.fallbackReason,
          generatedAt: new Date(service.now()).toISOString(),
          generationMs: performance.now() - started,
        };
        result = { proposal };
        payload = { proposal };
      }
      const next = service.commit(state, type, payload, userId, commandId, {
        actorId: userId,
        commandId,
        requestHash,
        result,
      });
      service.aiMetrics[generated.generationMode]++;
      return service.ack(next, result);
    });
  }
}
