// Checks only the pinned CC0 demo tracks; reads operator credentials privately.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.DEMO_ORIGIN;
if (!base || new URL(base).protocol !== "https:")
  throw new Error("Set DEMO_ORIGIN");
const login = JSON.parse(await readFile(process.argv[2], "utf8"));
const manifest = JSON.parse(
  await readFile("evidence/acceptance-legal-media.json", "utf8"),
);
const response = await fetch(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify(login),
});
assert.equal(response.status, 200);
const session = await response.json();
const headers = {
  Authorization: `Bearer ${session.accessToken}`,
  Origin: base,
};
try {
  const list = await fetch(`${base}/api/v1/tracks?limit=100`, { headers });
  assert.equal(list.status, 200);
  const { items } = await list.json();
  const verified = [];
  for (const source of manifest.tracks) {
    const track = items.find(
      (row) => row.title === source.title && row.assetId,
    );
    assert(track, `Missing playable ${source.title}`);
    const url = `${base}/api/v1/assets/${track.assetId}/content`;
    assert.equal((await fetch(url)).status, 401);
    const range = await fetch(url, {
      headers: { ...headers, Range: "bytes=0-63" },
    });
    assert.equal(range.status, 206);
    assert.match(range.headers.get("content-range"), /^bytes 0-63\//);
    assert.match(range.headers.get("cache-control"), /private.*no-store/);
    assert.equal((await range.arrayBuffer()).byteLength, 64);
    const full = await fetch(url, { headers });
    assert.equal(full.status, 200);
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      source.sha256,
    );
    verified.push(source.title);
  }
  console.log(
    JSON.stringify(
      {
        result: "passed",
        tracks: verified,
        checks: [
          "authenticated full-file publisher hashes",
          "authenticated 206 byte ranges",
          "anonymous denial",
          "private/no-store caching",
        ],
        limitation:
          "HTTP media verification, not browser audio playback or model acceptance",
      },
      null,
      2,
    ),
  );
} finally {
  await fetch(`${base}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      Origin: base,
      "X-CSRF-Protection": "1",
      Cookie: response.headers.get("set-cookie").split(";")[0],
    },
  });
}
