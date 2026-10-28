import { explainCompatibility } from "../src/compatibility.js";
import { compatible } from "../src/queue-reducer.js";
const track = (key = "8A", bpm = 120) => ({
  assetId: "test",
  profileStatus: "ready",
  acoustic: { bpm, camelotKey: key, energy: 0.5, valence: 0.5 },
});
test("compatibility explanations agree with the playback predicate for all keys and tempo boundaries", () => {
  const keys = Array.from({ length: 12 }, (_, i) => [
    `${i + 1}A`,
    `${i + 1}B`,
  ]).flat();
  for (const a of keys)
    for (const b of keys)
      for (const bpm of [
        55.2, 60, 64.8, 110.4, 120, 129.6, 129.61, 240, 259.2,
      ]) {
        const current = track(a),
          candidate = track(b, bpm);
        expect(explainCompatibility(current, candidate, 8).eligible).toBe(
          compatible(current.acoustic, candidate.acoustic, 8),
        );
      }
  expect(explainCompatibility(track(), track("10B", 300), 8).reasons).toEqual([
    "TEMPO_OUTSIDE_LIMIT",
    "KEY_INCOMPATIBLE",
  ]);
  expect(
    explainCompatibility(track(), { ...track(), acoustic: null }, 8).reasons,
  ).toEqual(["PROFILE_NEEDED"]);
  expect(
    explainCompatibility(track(), { ...track(), assetId: null }, 8).reasons,
  ).toEqual(["AUDIO_UNAVAILABLE"]);
});
