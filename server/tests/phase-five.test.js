import { fit, recommend, evaluate } from "../src/recommendations/model.js";
import { reduceRoom } from "../src/queue-reducer.js";
test("chronological split excludes future targets; reports denominators and baselines", () => {
  const tracks = Array.from({ length: 20 }, (_, i) => ({
    _id: `t${i}`,
    acoustic: { bpm: 120 + i, camelotKey: "8A", energy: i / 20, valence: 0.5 },
  }));
  const interactions = Array.from({ length: 10 }, (_, i) => [
    {
      userId: `u${i}`,
      trackId: `t${i}`,
      completed: true,
      createdAt: "2026-01-01",
    },
    {
      userId: `u${i}`,
      trackId: `t${i + 1}`,
      liked: true,
      createdAt: "2026-02-01",
    },
  ]).flat();
  const data = { tracks, interactions, cutoff: "2026-01-15" };
  const model = fit(data);
  expect(model.fitCount).toBe(10);
  expect(model.users.u0.t1).toBeUndefined();
  expect(recommend(model, "u0").some((t) => t.trackId === "t0")).toBe(false);
  const report = evaluate(data);
  expect(report).toMatchObject({
    population: 10,
    eligibleUsers: 10,
    coverage: 1,
    trainCount: 10,
    testCount: 10,
  });
  expect(Object.keys(report.metrics)).toEqual([
    "content",
    "collaborative",
    "hybrid",
  ]);
  expect(
    fit({ ...data, interactions: interactions.slice(1) }).modelVersion,
  ).not.toBe(model.modelVersion);
});
test("listening accrual stops at track end and preserves replay determinism", () => {
  const state = {
    revision: 1,
    nextUp: [],
    presentUserIds: ["u"],
    status: "live",
    nowPlaying: {
      durationSeconds: 10,
      offsetSeconds: 0,
      startedAt: 0,
      paused: false,
    },
    meterAt: 0,
    listeningMeters: { u: { available: 0, credited: 0, lastAt: 0 } },
  };
  const event = {
    type: "playback.pause",
    payload: { now: 30000 },
    occurredAt: new Date(30000),
    revision: 2,
    epoch: "epoch",
    reducerVersion: 1,
  };
  const next = reduceRoom(state, event);
  expect(next.listeningMeters.u.available).toBe(10);
  expect(reduceRoom(state, event)).toEqual(next);
  expect(state.listeningMeters.u.available).toBe(0);
});

import { summarize } from "../src/session-analytics.js";
test("recap battle outcomes use canonical resolution facts and cap detail without losing total", () => {
  const events = Array.from({length:105}, (_, index) => ({
    type:"battle.resolved", occurredAt:new Date(1000 * index), payload:{
      winningTrackId:`track-${index}`, track:{title:`Winner ${index}`,artist:"Original fixture"},
      applicationStatus:index%2 ? "reserved":"deferred", announcement:{body:`Canonical reason ${index}`},
    },
  }));
  const summary=summarize(events);
  expect(summary.resolvedBattleCount).toBe(105);
  expect(summary.battleOutcomes).toHaveLength(100);
  expect(summary.battleOutcomesTruncated).toBe(true);
  expect(summary.battleOutcomes[0]).toMatchObject({trackId:"track-5",reason:"Canonical reason 5",applicationStatus:"reserved"});
  expect(summarize([]).battleOutcomes).toEqual([]);
});
