import { compatible } from "./queue-reducer.js";
import { acoustic } from "./validation.js";

// Explain the same predicate used by immediate playback; never authorize a mutation.
export function explainCompatibility(current, candidate, tolerance) {
  const reasons = [];
  if (!candidate) return { eligible: false, reasons: ["TRACK_UNAVAILABLE"] };
  if (!candidate.assetId) reasons.push("AUDIO_UNAVAILABLE");
  if (
    current?.profileStatus !== "ready" ||
    candidate.profileStatus !== "ready" ||
    !acoustic.safeParse(current?.acoustic).success ||
    !acoustic.safeParse(candidate.acoustic).success
  ) {
    reasons.push("PROFILE_NEEDED");
  } else {
    const a = current.acoustic,
      b = candidate.acoustic;
    if (!compatible({ ...a, camelotKey: b.camelotKey }, b, tolerance))
      reasons.push("TEMPO_OUTSIDE_LIMIT");
    if (!compatible({ ...a, bpm: b.bpm }, b, tolerance))
      reasons.push("KEY_INCOMPATIBLE");
  }
  return { eligible: reasons.length === 0, reasons };
}
