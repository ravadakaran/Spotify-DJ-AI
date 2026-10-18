import { schemas, validateTimeline } from "../src/validation.js";
import { parseRange } from "../src/catalog.js";
import { seedProfiles } from "../src/persistence.js";
describe("Untrusted profile and range boundaries", () => {
  test("accepts all 24 keys and rejects invalid profiles", () => {
    for (let n = 1; n <= 12; n++)
      for (const letter of ["A", "B"])
        expect(
          schemas.profile.safeParse({
            expectedProfileVersion: 1,
            acoustic: {
              bpm: 120,
              camelotKey: `${n}${letter}`,
              energy: 0,
              valence: 1,
            },
            timeline: [],
          }).success,
        ).toBe(true);
    for (const change of [
      { bpm: 0 },
      { bpm: Infinity },
      { energy: -1 },
      { valence: 1.01 },
      { camelotKey: "13A" },
    ])
      expect(
        schemas.profile.safeParse({
          expectedProfileVersion: 1,
          acoustic: { ...seedProfiles[0].acoustic, ...change },
          timeline: [],
        }).success,
      ).toBe(false);
    expect(() => validateTimeline([{ ts: 21 }], 20)).toThrow();
  });
  test("range supports bounded and suffix requests without accepting unsafe ranges", () => {
    expect(parseRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=2-", 10)).toEqual({ start: 2, end: 9 });
    for (const value of [
      "bytes=10-",
      "bytes=4-2",
      "bytes=-0",
      "bytes=0-1,3-4",
      "bytes=-",
      "bytes=9007199254740992-",
    ])
      expect(() => parseRange(value, 10)).toThrow();
  });
  test("public registration cannot set admin privilege", () => {
    expect(
      schemas.register.safeParse({
        email: "person@example.test",
        displayName: "Person",
        password: "sufficient-test-password",
        isAdmin: true,
      }).success,
    ).toBe(false);
  });
});
