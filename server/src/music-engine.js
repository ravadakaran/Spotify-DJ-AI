import { acoustic } from "./validation.js";

export function match(a, b, tolerance = 8) {
  if (
    !acoustic.safeParse(a).success ||
    !acoustic.safeParse(b).success ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    tolerance > 8
  )
    return null;
  const x = Number(a.camelotKey.slice(0, -1)),
    y = Number(b.camelotKey.slice(0, -1));
  const sameLetter = a.camelotKey.slice(-1) === b.camelotKey.slice(-1);
  const distance = (x - y + 12) % 12;
  const camelotRelation =
    x === y
      ? sameLetter
        ? "same"
        : "relative"
      : sameLetter && [1, 11].includes(distance)
        ? "adjacent"
        : null;
  const tempos = [1, 0.5, 2].map((multiplier) => ({
    multiplier,
    delta: Math.abs(b.bpm / (a.bpm * multiplier) - 1),
  }));
  tempos.sort((a, b) => a.delta - b.delta);
  const { multiplier, delta } = tempos[0];
  if (!camelotRelation || delta > tolerance / 100 + 1e-10) return null;
  return { bpmDeltaPct: delta * 100, multiplier, camelotRelation };
}

export function rank(
  current,
  entries,
  { tolerance = 8, sentiment = 0, recent = [], reservedEntryId = null } = {},
) {
  if (
    current?.profileStatus !== "ready" ||
    !acoustic.safeParse(current.acoustic).success
  )
    return [];
  const targetEnergy = Math.max(
    0,
    Math.min(
      1,
      current.acoustic.energy + 0.2 * Math.max(-1, Math.min(1, sentiment)),
    ),
  );
  return entries
    .flatMap((entry) => {
      const t = entry.track;
      const reason =
        t?.profileStatus === "ready" &&
        match(current.acoustic, t.acoustic, tolerance);
      if (!reason) return [];
      const harmonicFit = { same: 1, relative: 0.8, adjacent: 0.7 }[
        reason.camelotRelation
      ];
      const energyFit = 1 - Math.abs(t.acoustic.energy - targetEnergy);
      const recencyFit = recent.slice(-5).includes(t.trackId) ? 0 : 1;
      return [
        {
          ...entry,
          matchReason: {
            ...reason,
            harmonicFit,
            energyFit,
            recencyFit,
            targetEnergy,
          },
          score: 0.5 * harmonicFit + 0.3 * energyFit + 0.2 * recencyFit,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.entryId === reservedEntryId) -
          Number(a.entryId === reservedEntryId) ||
        b.score - a.score ||
        b.voters.length - a.voters.length ||
        a.enqueueSequence - b.enqueueSequence ||
        a.entryId.localeCompare(b.entryId),
    );
}
