import React, { useEffect, useRef, useState } from "react";

const labels = {
  PROFILE_NEEDED: "Profile needed",
  TEMPO_OUTSIDE_LIMIT: "Tempo outside limit",
  KEY_INCOMPATIBLE: "Key incompatible",
  AUDIO_UNAVAILABLE: "Audio unavailable",
  TRACK_UNAVAILABLE: "Track unavailable",
};
export function useCompatibility(api, room, trackIds) {
  const apiRef = useRef(api);
  apiRef.current = api;
  const [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  // Vote reorders do not change compatibility; avoid refetching the same set.
  const ids = [...new Set(trackIds.filter(Boolean))]
    .sort()
    .slice(0, 200)
    .join(",");
  const loungeId = room?.loungeId,
    epoch = room?.epoch,
    currentTrackId = room?.nowPlaying?.trackId || room?.seedTrackId,
    currentProfileVersion = room?.nowPlaying?.profileVersion,
    tolerance = room?.settings?.bpmTolerancePct;
  useEffect(() => {
    if (!loungeId || !ids) return;
    let active = true;
    setError("");
    const timer = setTimeout(() => {
      apiRef
        .current(
          `/lounges/${loungeId}/compatibility?trackIds=${encodeURIComponent(ids)}`,
        )
        .then((report) => {
          if (active) setResult({ ...report, ids });
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    loungeId,
    epoch,
    currentTrackId,
    currentProfileVersion,
    tolerance,
    ids,
    attempt,
  ]);
  useEffect(() => {
    if (!loungeId || !ids) return;
    const timer = setInterval(() => setAttempt((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [loungeId, ids]);
  const ready =
    result?.epoch === epoch &&
    result?.currentTrackId === currentTrackId &&
    result?.bpmTolerancePct === tolerance &&
    result?.ids === ids;
  return {
    report: ready ? result : null,
    error,
    refresh: () => setAttempt((n) => n + 1),
  };
}
export function CompatibilityText({ item }) {
  return (
    <span
      className={`compatibility-text${item?.eligible ? " is-eligible" : ""}`}
    >
      {!item
        ? "Checking compatibility…"
        : item.eligible
          ? "Eligible next"
          : item.reasons
              .map((reason) => labels[reason] || "Check needed")
              .join(" · ")}
    </span>
  );
}
export default function TrackCompatibility({ api, room, trackId }) {
  const { report, error, refresh } = useCompatibility(api, room, [trackId]);
  if (!trackId) return null;
  return (
    <div className="compatibility-feedback">
      <small role="status">
        {error ? (
          "Compatibility check unavailable."
        ) : (
          <CompatibilityText item={report?.items[0]} />
        )}
      </small>
      <button type="button" className="text-button" onClick={refresh}>
        {error ? "Retry compatibility" : "Check compatibility again"}
      </button>
      <small>
        {report?.items[0]?.profileVersion != null && (
          <>
            Candidate profile v{report.items[0].profileVersion}
            {report.items[0].acoustic
              ? ` · ${report.items[0].acoustic.bpm} BPM · ${report.items[0].acoustic.camelotKey}`
              : ""}
            .{" "}
          </>
        )}
        Last server check
        {report ? ` at revision ${report.revision}` : " pending"}. Against the
        current track (or starting track); rechecked before playback.
      </small>
    </div>
  );
}
