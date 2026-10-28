import TrackPicker from "./TrackPicker.jsx";
import FirstSteps from "./FirstSteps.jsx";
import { Icon } from "./StudioVisuals.jsx";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./style.css";
import Dashboard from "./Dashboard.jsx";
import Catalog from "./Catalog.jsx";
import LoungeConsole from "./LoungeConsole.jsx";
import { createRoomSync } from "./room-sync.js";

function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [register, setRegister] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [history, setHistory] = useState([]);
  const [room, setRoom] = useState(null);
  const [invite, setInvite] = useState("");
  const [connection, setConnection] = useState("Offline");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const socketRef = useRef(null);
  const tokenRef = useRef(null);
  const refreshRef = useRef(null);
  const clockRef = useRef({
    serverAt: Date.now(),
    monotonicAt: performance.now(),
  });
  const [rtt, setRtt] = useState(null);
  async function refresh() {
    if (!refreshRef.current)
      refreshRef.current = fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "X-CSRF-Protection": "1" },
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Please sign in again.");
          const value = await response.json();
          tokenRef.current = value.accessToken;
          setSession(value);
          return value;
        })
        .finally(() => {
          refreshRef.current = null;
        });
    return refreshRef.current;
  }
  async function api(
    route,
    { method = "GET", body, commandId = crypto.randomUUID() } = {},
    retry = true,
  ) {
    const multipart = body instanceof FormData;
    const response = await fetch(`/api/v1${route}`, {
      method,
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(tokenRef.current
          ? { Authorization: `Bearer ${tokenRef.current}` }
          : {}),
        "X-CSRF-Protection": "1",
        "X-Command-Id": commandId,
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    if (response.status === 401 && retry && !route.startsWith("/auth/")) {
      try {
        await refresh();
        return api(route, { method, body, commandId }, false);
      } catch {
        setSession(null);
        setRoom(null);
      }
    }
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error?.message || "Request failed.");
      error.code = result.error?.code;
      throw error;
    }
    return result;
  }
  async function run(action) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      if (room && ["STALE_REVISION", "STALE_PROPOSAL", "STALE_GENERATION"].includes(e.code)) {
        socketRef.current?.emit("lounge.resync", { loungeId: room.loungeId });
        setError("The lounge changed. Refreshing now; review the latest state and try the action again.");
      } else setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!session) return;
    Promise.all([api("/tracks?limit=100"), api("/users/me/lounges")])
      .then(([catalog, lounges]) => {
        setTracks(catalog.items);
        setHistory(lounges.items);
      })
      .catch((e) => setError(e.message));
  }, [session?.user.id, room?.loungeId]);
  useEffect(() => {
    if (!session || !room?.loungeId) return;
    const socket = io("/lounges", {
      transports: ["websocket"],
      auth: { accessToken: session.accessToken },
    });
    socketRef.current = socket;
    let retryTimer,
      retryMs = 1000,
      syncReady = false;
    const sync = createRoomSync({
      apply: (state) =>
        setRoom((current) =>
          current?.loungeId === state.loungeId ? state : current,
        ),
      resync: () => subscribe("lounge.resync"),
    });
    const subscribe = (event) => {
      clearTimeout(retryTimer);
      syncReady = false;
      setConnection("Syncing");
      socket
        .timeout(3000)
        .emit(event, { loungeId: room.loungeId }, (error, ack) => {
          if (error || !ack?.ok) {
            setConnection("Sync unavailable");
            setError("Unable to synchronize this lounge.");
            if (ack?.error?.code === "FORBIDDEN") {
              setRoom(null);
              return;
            }
            retryTimer = setTimeout(() => {
              if (socket.connected) subscribe("lounge.resync");
            }, retryMs);
            retryMs = Math.min(10000, retryMs * 2);
            return;
          }
          sync.snapshot(ack.snapshot);
          syncReady = true;
          retryMs = 1000;
          setConnection("Connected");
        });
    };
    const ping = () => {
      if (!socket.connected) return;
      const start = performance.now();
      socket
        .timeout(3000)
        .emit(
          "lounge.sync.ping",
          { clientSentAt: Date.now() },
          (error, pong) => {
            if (error) {
              setConnection("Connection unavailable");
              return;
            }
            const elapsed = performance.now() - start;
            if (syncReady) setConnection("Connected");
            setRtt(Math.round(elapsed));
            clockRef.current = {
              serverAt: pong.serverSentAt + elapsed / 2,
              monotonicAt: performance.now(),
            };
          },
        );
    };
    const pingTimer = setInterval(ping, 5000);
    socket.on("connect", () => {
      setConnection("Syncing");
      sync.begin();
      subscribe("lounge.subscribe");
      ping();
    });
    socket.on("lounge.state.snapshot", ({ payload }) => sync.receive(payload));
    socket.on("lounge.membership.detached", () => {
      setRoom(null);
      setInvite("");
    });
    socket.on("disconnect", (reason) => {
      syncReady = false;
      clearTimeout(retryTimer);
      setConnection("Reconnecting");
      if (reason === "io server disconnect")
        refresh().catch(() => {
          setSession(null);
          setRoom(null);
        });
    });
    socket.on("connect_error", () => setConnection("Connection unavailable"));
    return () => {
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.accessToken, room?.loungeId]);
  const login = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => {
      if (register) await api("/auth/register", { method: "POST", body: data });
      const value = await api("/auth/login", {
        method: "POST",
        body: { email: data.email, password: data.password },
      });
      tokenRef.current = value.accessToken;
      setSession(value);
    });
  };
  const create = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => {
      const value = await api("/lounges", {
        method: "POST",
        body: {
          ...values,
          maxParticipants: 40,
          bpmTolerancePct: 8,
          soundclashEnabled: true,
          aiVerbosity: "normal",
        },
      });
      setInvite(value.inviteCode);
      setRoom(value);
    });
  };
  const join = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => {
      const value = await api("/lounges/join", {
        method: "POST",
        body: { inviteCode: values.inviteCode.trim().toUpperCase() },
      });
      setInvite("");
      setRoom(value);
    });
  };
  const upload = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(async () => {
      const result = await api("/assets", { method: "POST", body: values });
      setNotice(
        `Upload saved. Asset ID: ${result.assetId}; duration: ${result.durationSeconds.toFixed(2)} seconds. Use these values in the profile form.`,
      );
    });
  };
  const addTrack = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    run(async () => {
      await api("/tracks", {
        method: "POST",
        body: {
          title: values.title,
          artist: values.artist,
          assetId: values.assetId,
          durationSeconds: Number(values.durationSeconds),
          acoustic: {
            bpm: Number(values.bpm),
            camelotKey: values.camelotKey,
            energy: Number(values.energy),
            valence: Number(values.valence),
          },
          timeline: [],
        },
      });
      setTracks((await api("/tracks?limit=100")).items);
      setNotice("Track profile added.");
      form.reset();
    });
  };
  return (
    <div className={`app-shell${room ? " in-lounge" : ""}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="DJ Studio home">
          <span className="brand-icon">
            <Icon name="disc" size={28} />
          </span>{" "}
          DJ STUDIO
          <span className="version">LOCAL</span>
        </a>
        <div className="workspace-label">Your studio</div>
        <button
          className={!room ? "nav active" : "nav"}
          onClick={() => {
            setRoom(null);
            setError("");
          }}
        >
          <Icon name="grid" />
          <span>Overview</span>
        </button>
        <div className={room ? "nav active" : "nav muted"}>
          <Icon name="disc" />
          <span>Lounge console</span>
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" /> PRIVATE ENVIRONMENT
          <p>
            Your music. Your room.
            <br />A little more intention.
          </p>
        </div>
      </aside>
      <main>
        <header>
          <span className="breadcrumb">
            WORKSPACE <span>/</span> {room ? "LOUNGE CONSOLE" : "OVERVIEW"}
          </span>
          {session && (
            <div className="account">
              <span>{session.user.displayName}</span>
              <button
                className="text-button"
                onClick={() =>
                  run(async () => {
                    await api("/auth/logout", { method: "POST" });
                    tokenRef.current = null;
                    setSession(null);
                    setRoom(null);
                    setRegister(false);
                  })
                }
              >
                Sign out
              </button>
            </div>
          )}
        </header>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {!ready ? (
          <p className="loading">Opening your workspace…</p>
        ) : !session ? (
          <section className="welcome-grid">
            <div className="welcome-copy">
              <h1>
                Set the mood.
                <br />
                <em>Share the room.</em>
              </h1>
              <p>
                A private space for your next listening session. Create a
                lounge, invite your people, and build the set together.
              </p>
              <div className="record-art" aria-hidden="true">
                <div className="record">
                  <div className="record-label">
                    <span>
                      STUDIO
                      <br />
                      SESSIONS
                    </span>
                    <i />
                  </div>
                </div>
                <span className="record-caption">SIDE A / A NEW BEGINNING</span>
              </div>
              <div className="build-note">
                <span className="pill">LIVE ROOM RELEASE</span> Create a room,
                build the queue together and listen to your local music.
              </div>
            </div>
            <form className="panel auth-panel" onSubmit={login}>
              <h2>
                {register ? "Make yourself at home." : "Good to have you back."}
              </h2>
              <p className="subtle">
                {register
                  ? "Create your private studio account."
                  : "Sign in to find your room."}
              </p>
              {register && (
                <label>
                  Display name
                  <input
                    name="displayName"
                    autoComplete="nickname"
                    required
                    maxLength={80}
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  required
                  placeholder={
                    register ? "At least 12 characters" : "Your password"
                  }
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : register
                    ? "Create account →"
                    : "Enter the studio →"}
              </button>
              <button
                type="button"
                className="text-button switch"
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {register
                  ? "Already a member? Sign in"
                  : "New here? Create an account"}
              </button>
              <div className="form-footnote">
                Private local accounts. No Spotify connection.
              </div>
            </form>
          </section>
        ) : room ? (
          <>
            <section className="page-title">
              <div>
                <h1>{room.vibeProfile}</h1>
                <p>Your people. Your queue. One shared listening room.</p>
              </div>
              <span className="pill live">
                <span className="status-dot" />
                {connection}
              </span>
              {rtt !== null && (
                <small className="connection-quality">
                  {rtt} ms ·{" "}
                  {rtt < 150
                    ? "Good connection"
                    : rtt < 500
                      ? "Fair connection"
                      : "Slow connection"}
                </small>
              )}
            </section>
            {invite && (
              <div className="invite-banner">
                <div>
                  <span className="invite-label">Invite your people</span>
                  <code>{invite}</code>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(invite);
                      setNotice("Invite code copied.");
                    })
                  }
                >
                  Copy code ↗
                </button>
              </div>
            )}
            <LoungeConsole
              socketRef={socketRef}
              room={room}
              tracks={tracks}
              session={session}
              api={api}
              run={run}
              setInvite={setInvite}
              setRoom={setRoom}
              clock={clockRef}
              connection={connection}
            />
          </>
        ) : (
          <>
            <section className="page-title">
              <div>
                <h1>
                  Your next session
                  <br />
                  starts here<span className="green">.</span>
                </h1>
                <p>
                  Create a room for your people, or step into one that’s
                  waiting.
                </p>
              </div>
              <span className="pill">
                <Icon name="disc" size={16} /> Your private listening space
              </span>
            </section>
            <div className="action-grid">
              <form className="panel" onSubmit={create}>
                <div className="tile-icon">
                  <Icon name="plus" />
                </div>
                <h2>Start a new lounge</h2>
                <FirstSteps />
                <p className="subtle">Choose the vibe and a starting track.</p>
                <label>
                  Lounge vibe
                  <input
                    name="vibeProfile"
                    placeholder="Late night listening"
                    required
                    maxLength={80}
                  />
                </label>
                <TrackPicker api={api} tracks={tracks} name="seedTrackId" label="Starting track" starting />
                <button className="primary" disabled={busy || !tracks.length}>
                  Create lounge →
                </button>
                {!tracks.length && (
                  <p className="form-footnote">
                    Catalog empty. Run the seed command or ask an admin to add
                    tracks.
                  </p>
                )}
              </form>
              <form className="panel join-panel" onSubmit={join}>
                <div className="tile-icon">
                  <Icon name="arrow" />
                </div>
                <h2>Find your people</h2>
                <p className="subtle">
                  Have an invite? There’s a place for you.
                </p>
                <label>
                  Invite code
                  <input
                    name="inviteCode"
                    placeholder="16-character invite code"
                    required
                    minLength={16}
                    maxLength={16}
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Join lounge ↗
                </button>
                <div className="join-note">
                  <Icon name="room" size={32} />
                  <p>
                    One room. One shared state.
                    <br />A session that starts with you.
                  </p>
                </div>
              </form>
            </div>
            <section className="recent">
              <div className="section-top">
                <h2>Your lounges</h2>
                <span className="eyebrow">RECENT MEMBERSHIPS</span>
              </div>
              {history.length ? (
                history.map((l) => (
                  <button
                    key={l.loungeId}
                    className="history-row"
                    onClick={() =>
                      run(async () => {
                        setInvite("");
                        setRoom(await api(`/lounges/${l.loungeId}`));
                      })
                    }
                  >
                    <span>{l.vibeProfile}</span>
                    <small>{l.status} ↗</small>
                  </button>
                ))
              ) : (
                <div className="empty">
                  No sessions yet. Your first lounge is a good place to start.
                </div>
              )}
            </section>
            <Dashboard
              api={api}
              run={run}
              tracks={tracks}
              isAdmin={session.user.isAdmin}
            />
            <Catalog
              tracks={tracks}
              token={session.accessToken}
              api={api}
              isAdmin={session.user.isAdmin}
              reload={async () =>
                setTracks((await api("/tracks?limit=100")).items)
              }
            />
            {session.user.isAdmin && (
              <details className="panel admin">
                <summary>Admin · Authorized local catalog</summary>
                <p className="subtle">
                  Upload only original or licensed media. YouTube download
                  provenance alone does not establish a license.
                </p>
                <div className="action-grid">
                  <form onSubmit={upload}>
                    <h3>1. Upload audio</h3>
                    <label>
                      WAV, MP3 or M4A
                      <input
                        type="file"
                        name="file"
                        accept="audio/wav,audio/mpeg,audio/mp4,.m4a"
                        required
                      />
                    </label>
                    <label>
                      License
                      <input name="licenseLabel" required maxLength={200} />
                    </label>
                    <label>
                      Source attribution
                      <input
                        name="sourceAttribution"
                        required
                        maxLength={1000}
                      />
                    </label>
                    <button className="secondary" disabled={busy}>
                      Upload asset
                    </button>
                  </form>
                  <form onSubmit={addTrack}>
                    <h3>2. Create profile</h3>
                    {[
                      "title",
                      "artist",
                      "assetId",
                      "durationSeconds",
                      "bpm",
                      "camelotKey",
                      "energy",
                      "valence",
                    ].map((key) => (
                      <label key={key}>
                        {key}
                        <input name={key} required />
                      </label>
                    ))}
                    <button className="primary" disabled={busy}>
                      Save track
                    </button>
                  </form>
                </div>
              </details>
            )}
          </>
        )}
        <footer>
          <span>AI DJ STUDIO</span>
          <span>LOCAL MUSIC. SHARED MOMENTS.</span>
          <span>PRIVATE STUDIO / 0.1</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
