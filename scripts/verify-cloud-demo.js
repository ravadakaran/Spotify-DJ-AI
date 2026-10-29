// Opt-in live validation. Creates two labelled demo accounts and ends its room.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { io } from "socket.io-client";

const base = process.env.DEMO_ORIGIN;
const transport = process.env.DEMO_TRANSPORT || "websocket";
assert.ok(["polling", "websocket"].includes(transport));
if (!base || new URL(base).protocol !== "https:")
  throw new Error("Set DEMO_ORIGIN to the selected demo HTTPS origin.");
const checks = [],
  sockets = [];
const pass = (name) => checks.push(name);
async function http(route, options = {}) {
  const response = await fetch(`${base}/api/v1${route}`, {
    method: options.method || "GET",
    headers: {
      Origin: options.origin || base,
      "Content-Type": "application/json",
      "X-CSRF-Protection": "1",
      "X-Command-Id": options.commandId || randomUUID(),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const value = response.status === 204 ? null : await response.json();
  if (options.status !== undefined)
    assert.equal(
      response.status,
      options.status,
      `${route}: ${value?.error?.code || response.status}`,
    );
  return { response, value };
}
async function user(label) {
  const email = `cloud-${label}-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  await http("/auth/register", {
    method: "POST",
    body: { email, password, displayName: `Cloud check ${label}` },
    status: 201,
  });
  const login = await http("/auth/login", {
    method: "POST",
    body: { email, password },
    status: 200,
  });
  const cookie = login.response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);
  return { token: login.value.accessToken, cookie: cookie.split(";")[0] };
}
const emit = (socket, event, payload) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(15000)
      .emit(event, payload, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
  );
async function socketFor(user, roomId) {
  const socket = io(`${base}/lounges`, {
    auth: { accessToken: user.token },
    extraHeaders: { Origin: base },
    transports: [transport],
    reconnection: false,
    timeout: 15000,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  assert.equal(
    (await emit(socket, "lounge.subscribe", { loungeId: roomId })).ok,
    true,
  );
  return socket;
}
let host, guest, roomId;
try {
  await http("/health/live", { status: 200 });
  await http("/health/ready", { status: 200 });
  assert.match(await (await fetch(base)).text(), /AI DJ Studio/);
  pass("trusted HTTPS, frontend, liveness and readiness");
  if (transport === "polling") {
    const handshake = `${base}/socket.io/?EIO=4&transport=polling`;
    for (const [headers, expected] of [
      [{ "Sec-Fetch-Site": "same-origin" }, 200],
      [{ "Sec-Fetch-Site": "cross-site" }, 403],
      [{}, 403],
      [{ "Sec-Fetch-Site": "same-origin", Origin: "https://wrong.example" }, 403],
    ]) {
      assert.equal((await fetch(handshake, { headers })).status, expected);
    }
    assert.ok([400, 403].includes((await fetch(handshake, {
      method: "POST", headers: { "Sec-Fetch-Site": "same-origin" },
    })).status));
    pass("browser same-origin polling GET normalization; missing/cross-site/wrong origins and POST denied");
  }
  await http("/users/me", { status: 401 });
  await http(`/assets/${randomUUID()}/content`, { status: 401 });
  host = await user("host");
  guest = await user("guest");
  pass("secure strict HttpOnly login cookies and anonymous media denial");
  await http("/auth/refresh", {
    method: "POST",
    cookie: host.cookie,
    origin: "https://untrusted.example",
    body: {},
    status: 403,
  });
  const refreshed = await http("/auth/refresh", {
    method: "POST",
    cookie: host.cookie,
    body: {},
    status: 200,
  });
  host.token = refreshed.value.accessToken;
  host.cookie = refreshed.response.headers.get("set-cookie").split(";")[0];
  pass("refresh succeeds on selected origin; wrong origin denied");
  await http("/admin/recommendation-jobs", {
    token: guest.token,
    method: "POST",
    body: {},
    status: 403,
  });
  const created = await http("/lounges", {
    token: host.token,
    method: "POST",
    body: {
      seedTrackId: "00000000-0000-4000-8000-000000000001",
      vibeProfile: "Cloud deployment check (metadata only)",
      maxParticipants: 4,
      bpmTolerancePct: 8,
      soundclashEnabled: true,
      aiVerbosity: "normal",
    },
    status: 201,
  });
  roomId = created.value.loungeId;
  await http("/lounges/join", {
    token: guest.token,
    method: "POST",
    body: { inviteCode: created.value.inviteCode },
    status: 200,
  });
  const hs = await socketFor(host, roomId),
    gs = await socketFor(guest, roomId);
  let state = (
    await http(`/lounges/${roomId}`, { token: host.token, status: 200 })
  ).value;
  const denied = await emit(gs, "lounge.command", {
    type: "room.end",
    commandId: randomUUID(),
    payload: { expectedRevision: state.revision },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "FORBIDDEN");
  await http(`/lounges/${roomId}/end`, {
    token: guest.token,
    method: "POST",
    body: { expectedRevision: state.revision },
    status: 403,
  });
  pass(`two-user join/${transport} subscribe and HTTP/socket role denial`);
  const queued = await emit(hs, "lounge.command", {
    type: "queue.enqueue",
    commandId: randomUUID(),
    payload: {
      trackId: "00000000-0000-4000-8000-000000000002",
      expectedRevision: state.revision,
    },
  });
  assert.equal(queued.ok, true);
  state = (await http(`/lounges/${roomId}`, { token: host.token, status: 200 }))
    .value;
  const entryId = state.nextUp[0].entryId;
  const id = randomUUID();
  const votes = await Promise.all(
    Array.from({ length: 10 }, () =>
      emit(gs, "lounge.command", {
        type: "queue.vote",
        commandId: id,
        payload: { entryId, upvoted: true },
      }),
    ),
  );
  assert(votes.every((vote) => vote.ok));
  const after = (
    await http(`/lounges/${roomId}`, { token: host.token, status: 200 })
  ).value;
  assert.equal(after.revision, state.revision + 1);
  assert.equal(after.nextUp[0].voteCount, 1);
  gs.disconnect();
  gs.connect();
  await new Promise((resolve, reject) => {
    gs.once("connect", resolve);
    gs.once("connect_error", reject);
  });
  assert.equal(
    (await emit(gs, "lounge.subscribe", { loungeId: roomId })).ok,
    true,
  );
  pass("concurrent retry deduplication, one vote and socket reconnect");
  const finalState = (
    await http(`/lounges/${roomId}`, { token: host.token, status: 200 })
  ).value;
  const ended = await emit(hs, "lounge.command", {
    type: "room.end",
    commandId: randomUUID(),
    payload: { expectedRevision: finalState.revision },
  });
  assert.equal(ended.ok, true);
  roomId = undefined;
  pass("host session end and durable flush response");
  for (const u of [host, guest])
    await http("/auth/logout", {
      token: u.token,
      cookie: u.cookie,
      method: "POST",
      body: {},
      status: 204,
    });
  console.log(
    JSON.stringify(
      {
        origin: base,
        transport,
        checks,
        result: "passed",
        fixture: "metadata only; no playable audio verified",
      },
      null,
      2,
    ),
  );
} finally {
  for (const socket of sockets) socket.disconnect();
  if (host && roomId) {
    const state = (await http(`/lounges/${roomId}`, { token: host.token }))
      .value;
    await http(`/lounges/${roomId}/end`, {
      token: host.token,
      method: "POST",
      body: { expectedRevision: state.revision },
    });
  }
}
