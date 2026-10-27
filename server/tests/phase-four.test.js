import { readFile } from "node:fs/promises";
import { scoreSentiment, rollingSentiment } from "../src/sentiment.js";
import { rank } from "../src/music-engine.js";
test("locked 150-message authored sentiment audit and negation/intensity behavior", async () => {
  const dataset = JSON.parse(
    await readFile(
      new URL("./fixtures/sentiment-locked.json", import.meta.url),
    ),
  );
  let correct = 0,
    count = 0;
  for (const label of ["positive", "neutral", "negative"])
    for (const text of dataset[label]) {
      count++;
      if (scoreSentiment(text).sentimentBucket === label) correct++;
    }
  expect(count).toBeGreaterThanOrEqual(150);
  expect(correct / count).toBeGreaterThanOrEqual(0.85);
  expect(scoreSentiment("not good").sentimentScore).toBeLessThan(0);
  expect(scoreSentiment("really good").sentimentScore).toBeGreaterThan(
    scoreSentiment("good").sentimentScore,
  );
  expect(scoreSentiment("123").sentimentBucket).toBe("neutral");
});
test("equal latest-per-user window expires and changes eligible energy ranking", () => {
  const track = (id, energy) => ({
    trackId: id,
    profileStatus: "ready",
    acoustic: { bpm: 120, camelotKey: "8A", valence: 0.5, energy },
  });
  const current = track("current", 0.5),
    entries = [0.3, 0.7].map((energy, i) => ({
      entryId: String(i),
      trackId: String(i),
      track: track(String(i), energy),
      enqueueSequence: i,
      voters: [],
    }));
  const positive = rollingSentiment({ one: { at: 1000, score: 1 } }, 2000);
  const negative = rollingSentiment({ one: { at: 2000, score: -1 } }, 3000);
  expect(
    rank(current, entries, { sentiment: positive.rollingScore })[0].entryId,
  ).toBe("1");
  expect(
    rank(current, entries, { sentiment: negative.rollingScore })[0].entryId,
  ).toBe("0");
  expect(
    rollingSentiment({ one: { at: 1000, score: 1 } }, 31000).sampleSize,
  ).toBe(0);
});
