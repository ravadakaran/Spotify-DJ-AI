import { RoomService } from "../src/live-rooms.js";
test("public snapshots isolate mutable queue state and omit actor-bound receipts/meters", () => {
  const state = {
    loungeId: "room",
    revision: 3,
    epoch: "epoch",
    presentUserIds: ["member"],
    mutationFrozen: false,
    nextUp: [
      { entryId: "entry", voters: ["member"], track: { title: "Original" } },
    ],
    recentCommands: [{ result: { answer: "actor-private answer" } }],
    listeningMeters: { member: { credited: 7 } },
    meterAt: 10,
    sentimentSamples: { member: { score: 1 } },
  };
  const service = {
    durable: new Map([["room", 2]]),
    writer: { failed: false },
    degradedAt: null,
    now: () => 1000,
  };
  const view = RoomService.prototype.view.call(service, state);
  for (const field of [
    "recentCommands",
    "listeningMeters",
    "meterAt",
    "sentimentSamples",
  ])
    expect(view).not.toHaveProperty(field);
  expect(JSON.stringify(view)).not.toContain("actor-private answer");
  expect(view.nextUp[0]).toMatchObject({ position: 0, voteCount: 1 });
  view.nextUp[0].voters.push("other");
  view.nextUp[0].track.title = "Changed";
  expect(state.nextUp[0].voters).toEqual(["member"]);
  expect(state.nextUp[0].track.title).toBe("Original");
  expect(state.recentCommands[0].result.answer).toBe("actor-private answer");
});
