export function summarize(events) {
  let startedAt = null,
    endedAt = null,
    peakParticipants = 0,
    battleCount = 0,
    questionCount = 0,
    resolvedBattleCount = 0;
  const sentimentTimeline = [],
    trackHistory = [],
    battleOutcomes = [];
  for (const e of events) {
    const at = new Date(e.occurredAt).toISOString();
    if (e.type === "playback.start") {
      startedAt ??= at;
      trackHistory.push({
        ...e.payload.track,
        playbackId: e.payload.playbackId,
        startedAt: at,
      });
    }
    if (e.type === "room.end") endedAt = at;
    if (e.type === "presence.set")
      peakParticipants = Math.max(
        peakParticipants,
        new Set(e.payload.userIds).size,
      );
    if (e.type === "battle.open") battleCount++;
    if (e.type === "battle.resolved") {
      resolvedBattleCount++;
      battleOutcomes.push({
        at,
        trackId: e.payload.winningTrackId,
        title: e.payload.track.title,
        artist: e.payload.track.artist,
        applicationStatus: e.payload.applicationStatus,
        reason: e.payload.announcement.body,
      });
      if (battleOutcomes.length > 100) battleOutcomes.shift();
    }
    if (e.type === "ai.question") questionCount++;
    if (e.type === "sentiment.tick")
      sentimentTimeline.push({ at, ...e.payload.sentiment });
  }
  return {
    startedAt,
    endedAt,
    durationSeconds:
      startedAt && endedAt
        ? (Date.parse(endedAt) - Date.parse(startedAt)) / 1000
        : 0,
    peakParticipants,
    battleCount,
    questionCount,
    resolvedBattleCount,
    battleOutcomes,
    battleOutcomesTruncated: resolvedBattleCount > battleOutcomes.length,
    sentimentTimeline,
    trackHistory,
  };
}
