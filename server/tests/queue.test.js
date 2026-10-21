import {
  compatible,
  reduceRoom,
  queueOrder,
  position,
} from "../src/queue-reducer.js";
import { createRoomSync } from "../../client/src/room-sync.js";
import { EventWriter } from "../src/event-writer.js";

test("pure reducer preserves input and orders ties by sequence then entry ID", () => {
  const initial = { revision: 0, nextUp: [], enqueueSequence: 0 };
  const reduce = (s, type, payload, actorId = "user") =>
    reduceRoom(s, {
      type,
      payload,
      actorId,
      revision: s.revision + 1,
      epoch: "test",
      reducerVersion: 1,
    });
  let state = reduce(initial, "queue.enqueue", {
    entryId: "a",
    track: { trackId: "track-a" },
  });
  state = reduce(state, "queue.enqueue", {
    entryId: "b",
    track: { trackId: "track-b" },
  });
  for (let i = 0; i < 100; i++)
    state = reduce(
      state,
      "queue.vote",
      { entryId: "b", upvoted: true },
      `user-${i % 10}`,
    );
  expect(state.nextUp.map((e) => e.entryId)).toEqual(["b", "a"]);
  expect(state.nextUp[0].voters).toHaveLength(10);
  expect(initial.nextUp).toEqual([]);
  for (let i = 0; i < 10; i++)
    state = reduce(
      state,
      "queue.vote",
      { entryId: "b", upvoted: false },
      `user-${i}`,
    );
  expect(state.nextUp.map((e) => e.entryId)).toEqual(["a", "b"]);
  expect(
    [
      { entryId: "b", voters: [], enqueueSequence: 1 },
      { entryId: "a", voters: [], enqueueSequence: 1 },
    ].sort(queueOrder)[0].entryId,
  ).toBe("a");
});
test("hard compatibility covers all keys, wrapped adjacency, relative keys, tempo bounds and missing metadata", () => {
  for (let n = 1; n <= 12; n++)
    for (const letter of ["A", "B"]) {
      const current = { bpm: 120, camelotKey: `${n}${letter}` };
      for (const key of [
        `${n}${letter}`,
        `${(n % 12) + 1}${letter}`,
        `${((n + 10) % 12) + 1}${letter}`,
        `${n}${letter === "A" ? "B" : "A"}`,
      ])
        expect(compatible(current, { bpm: 129.6, camelotKey: key })).toBe(true);
      expect(
        compatible(current, { bpm: 60, camelotKey: current.camelotKey }),
      ).toBe(true);
      expect(
        compatible(current, { bpm: 240, camelotKey: current.camelotKey }),
      ).toBe(true);
      expect(
        compatible(current, { bpm: 129.61, camelotKey: current.camelotKey }),
      ).toBe(false);
      expect(
        compatible(current, {
          bpm: 120,
          camelotKey: `${(n % 12) + 1}${letter === "A" ? "B" : "A"}`,
        }),
      ).toBe(false);
    }
  expect(compatible(null, { bpm: 120, camelotKey: "8A" })).toBe(false);
  expect(
    position(
      { paused: false, startedAt: 1000, offsetSeconds: 5, durationSeconds: 20 },
      4000,
    ),
  ).toBe(8);
});
test("client buffers catch-up, requests resync on gaps/epochs and never regresses to retired epochs", () => {
  const applied = [];
  let resyncs = 0;
  const sync = createRoomSync({
    apply: (s) => applied.push(s),
    resync: () => resyncs++,
  });
  const s = (revision, epoch = "a") => ({
    epoch,
    revision,
    serverTime: revision,
  });
  sync.receive(s(2));
  sync.snapshot(s(1));
  expect(applied.at(-1).revision).toBe(2);
  sync.receive(s(4));
  expect(resyncs).toBe(1);
  expect(applied.at(-1).revision).toBe(2);
  sync.receive(s(5));
  sync.snapshot(s(4));
  expect(applied.at(-1).revision).toBe(5);
  sync.receive(s(1, "b"));
  expect(resyncs).toBe(2);
  sync.snapshot(s(1, "b"));
  sync.receive(s(99, "a"));
  expect(applied.at(-1).epoch).toBe("b");
  expect(resyncs).toBe(2);
});
test("event buffer rejects growth beyond its declared cap", () => {
  const writer = new EventWriter({}, null, { maxEvents: 2, intervalMs: 60000 });
  try {
    writer.append({ revision: 1 }, {});
    writer.append({ revision: 2 }, {});
    expect(() => writer.append({ revision: 3 }, {})).toThrow("full");
    expect(writer.buffer).toHaveLength(2);
  } finally {
    writer.stop();
  }
});
