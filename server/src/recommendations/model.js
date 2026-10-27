import { createHash } from "node:crypto";
export const positive = (r) => r.completed || r.liked;
export function fit({ tracks, interactions, cutoff }) {
  const rows = interactions.filter(
    (r) =>
      new Date(r.observedAt ?? r.createdAt).getTime() <=
        new Date(cutoff).getTime() && positive(r),
  );
  const users = {},
    items = {};
  for (const r of rows) {
    (users[r.userId] ??= {})[r.trackId] = 1;
    (items[r.trackId] ??= {})[r.userId] = 1;
  }
  const similarities = {};
  for (const a of tracks) {
    similarities[a._id] = {};
    for (const b of tracks) {
      const x = Object.keys(items[a._id] || {}),
        y = items[b._id] || {};
      similarities[a._id][b._id] =
        x.length && Object.keys(y).length
          ? x.filter((u) => y[u]).length /
            Math.sqrt(x.length * Object.keys(y).length)
          : 0;
    }
  }
  const dataHash = createHash("sha256")
    .update(JSON.stringify({ tracks, rows, cutoff }))
    .digest("hex");
  return {
    modelVersion: `hybrid-v1-${dataHash.slice(0, 16)}`,
    algorithmVersion: "hybrid-v1",
    dataHash,
    cutoff,
    tracks,
    users,
    similarities,
    fitCount: rows.length,
  };
}
export function content(a, b) {
  if (!a || !b) return 0;
  const key = (k) => Number(k.slice(0, -1));
  const d = Math.abs(key(a.camelotKey) - key(b.camelotKey));
  return (
    (Math.max(0, 1 - Math.abs(a.bpm - b.bpm) / Math.max(a.bpm, b.bpm)) +
      1 -
      Math.min(d, 12 - d) / 6 +
      1 -
      Math.abs(a.energy - b.energy) +
      1 -
      Math.abs(a.valence - b.valence)) /
    4
  );
}
export function recommend(model, userId, limit = 5, mode = "hybrid") {
  const seen = model.users[userId] || {},
    anchors = model.tracks.filter((t) => seen[t._id]);
  return model.tracks
    .filter((t) => !seen[t._id])
    .map((t) => {
      const acoustic = anchors.length
        ? anchors.reduce((n, a) => n + content(a.acoustic, t.acoustic), 0) /
          anchors.length
        : 0;
      const collaborative = anchors.length
        ? anchors.reduce(
            (n, a) => n + (model.similarities[a._id]?.[t._id] || 0),
            0,
          ) / anchors.length
        : Object.values(model.users).filter((u) => u[t._id]).length /
          Math.max(1, Object.keys(model.users).length);
      return {
        trackId: t._id,
        title: t.title,
        artist: t.artist,
        score:
          mode === "content"
            ? acoustic
            : mode === "collaborative"
              ? collaborative
              : anchors.length
                ? 0.6 * acoustic + 0.4 * collaborative
                : collaborative,
        reason: anchors.length
          ? "Acoustic fit and shared listening"
          : "Catalog popularity",
      };
    })
    .sort((a, b) => b.score - a.score || a.trackId.localeCompare(b.trackId))
    .slice(0, limit);
}
export function evaluate(dataset) {
  const train = dataset.interactions.filter(
    (r) => new Date(r.observedAt ?? r.createdAt) <= new Date(dataset.cutoff),
  );
  const heldout = dataset.interactions.filter(
    (r) => new Date(r.observedAt ?? r.createdAt) > new Date(dataset.cutoff),
  );
  const model = fit({ ...dataset, interactions: train });
  const population = [...new Set(heldout.map((r) => r.userId))];
  const eligible = population.filter(
    (u) =>
      dataset.tracks.filter((t) => !model.users[u]?.[t._id]).length >= 5 &&
      heldout.some(
        (r) => r.userId === u && positive(r) && !model.users[u]?.[r.trackId],
      ),
  );
  const metrics = {};
  for (const mode of ["content", "collaborative", "hybrid"])
    metrics[mode] = eligible.length
      ? eligible.reduce((sum, u) => {
          const relevant = new Set(
            heldout
              .filter(
                (r) =>
                  r.userId === u && positive(r) && !model.users[u]?.[r.trackId],
              )
              .map((r) => r.trackId),
          );
          return (
            sum +
            recommend(model, u, 5, mode).filter((r) => relevant.has(r.trackId))
              .length /
              5
          );
        }, 0) / eligible.length
      : null;
  return {
    metrics,
    population: population.length,
    eligibleUsers: eligible.length,
    excludedUsers: population.filter((u) => !eligible.includes(u)),
    coverage: population.length ? eligible.length / population.length : 0,
    trainCount: train.length,
    testCount: heldout.length,
    dataHash: model.dataHash,
    cutoff: dataset.cutoff,
  };
}
