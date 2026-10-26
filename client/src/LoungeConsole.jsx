import React, { useEffect, useRef, useState } from "react";
import AiConsole from "./AiConsole.jsx";

function elapsed(p, now) {
  return p
    ? Math.min(
        p.durationSeconds,
        p.offsetSeconds +
          (p.paused ? 0 : Math.max(0, now - p.startedAt) / 1000),
      )
    : 0;
}
const time = (value) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

function Player({ room, token, clock, connected }) {
  const audio = useRef(null),
    context = useRef(null),
    source = useRef(null);
  const [unlocked, setUnlocked] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [now, setNow] = useState(Date.now());
  const latest = useRef(room);
  latest.current = room;
  const playback = room.nowPlaying;
  useEffect(() => {
    const tick = setInterval(
      () =>
        setNow(
          clock.current.serverAt +
            performance.now() -
            clock.current.monotonicAt,
        ),
      200,
    );
    return () => clearInterval(tick);
  }, [clock]);
  useEffect(() => {
    const controller = new AbortController();
    let url;
    setLoaded(false);
    setError("");
    const element = audio.current;
    if (playback?.assetId && unlocked)
      (async () => {
        // Bounded files (25 MiB server cap); assemble authenticated range responses.
        const chunks = [];
        let start = 0,
          total = Infinity;
        while (start < total) {
          const response = await fetch(
            `/api/v1/assets/${playback.assetId}/content`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Range: `bytes=${start}-${start + 1048575}`,
              },
              signal: controller.signal,
            },
          );
          if (!response.ok)
            throw new Error(
              "Audio unavailable. Refresh your session and try again.",
            );
          const chunk = await response.blob();
          chunks.push(chunk);
          if (response.status === 200) {
            total = chunk.size;
            break;
          }
          total = Number(response.headers.get("Content-Range")?.split("/")[1]);
          if (
            !Number.isFinite(total) ||
            total > 25 * 1024 * 1024 ||
            !chunk.size
          )
            throw new Error("Invalid audio range response.");
          start += chunk.size;
        }
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type }));
        element.src = url;
        setLoaded(true);
      })().catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      controller.abort();
      element.pause();
      element.removeAttribute("src");
      element.load();
      if (url) URL.revokeObjectURL(url);
    };
  }, [playback?.playbackId, playback?.assetId, token, unlocked]);
  useEffect(() => {
    const element = audio.current;
    if (!loaded || !unlocked) return;
    const sync = () => {
      const p = latest.current.nowPlaying;
      if (!p) return;
      const at = elapsed(
        p,
        clock.current.serverAt + performance.now() - clock.current.monotonicAt,
      );
      if (
        Number.isFinite(element.duration) &&
        Math.abs(element.currentTime - at) > 0.75
      )
        element.currentTime = Math.min(at, element.duration);
      if (p.paused || latest.current.mutationFrozen || !connected)
        element.pause();
      else if (element.paused)
        element
          .play()
          .catch(() => setError("Playback blocked. Click Enable audio again."));
    };
    element.addEventListener("loadedmetadata", sync);
    sync();
    const timer = setInterval(sync, 500);
    return () => {
      clearInterval(timer);
      element.removeEventListener("loadedmetadata", sync);
    };
  }, [loaded, unlocked, room.revision, room.mutationFrozen, connected, clock]);
  useEffect(
    () => () => {
      context.current?.close();
    },
    [],
  );
  async function unlock() {
    try {
      context.current ||= new AudioContext();
      if (!source.current) {
        source.current = context.current.createMediaElementSource(
          audio.current,
        );
        source.current.connect(context.current.destination);
      }
      await context.current.resume();
      setUnlocked(true);
      setError("");
      if (audio.current.src && !latest.current.nowPlaying?.paused)
        await audio.current.play();
    } catch {
      setError("Your browser blocked audio. Try Enable audio again.");
    }
  }
  const offset = elapsed(playback, now);
  return (
    <section className="panel player">
      <span className="eyebrow">NOW PLAYING</span>
      <h2>{playback?.title || "Ready when you are"}</h2>
      <p className="subtle">
        {playback?.artist || "The Host starts the selected track."}
      </p>
      <audio ref={audio} aria-label="Lounge audio" />
      <progress
        aria-label="Track progress"
        max={playback?.durationSeconds || 1}
        value={offset}
      />
      <p className="playback-time">
        {time(offset)} / {time(playback?.durationSeconds || 0)} ·{" "}
        {playback?.paused ? "Paused" : playback ? "Playing" : "Scheduled"}
      </p>
      <button className="secondary" onClick={unlock}>
        {unlocked ? "Enable audio again" : "Enable audio"}
      </button>
      {!unlocked && (
        <p className="form-footnote">
          Enable audio on each device to hear the shared playback.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function LoungeConsole({
  room,
  tracks,
  session,
  api,
  run,
  setInvite,
  setRoom,
  clock,
  connection,
}) {
  const member = room.members.find((m) => m.userId === session.user.id),
    host = member?.role === "host",
    dj = host || member?.role === "co_dj";
  const disabled = room.mutationFrozen || connection !== "Connected";
  const [busy, setBusy] = useState(false);
  const positions = useRef(new Map()),
    list = useRef(null);
  useEffect(() => {
    for (const element of list.current?.children || []) {
      const old = positions.current.get(element.dataset.id),
        top =
          element.getBoundingClientRect().top -
          list.current.getBoundingClientRect().top;
      if (
        old !== undefined &&
        old !== top &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        element.animate(
          [
            { transform: `translateY(${old - top}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 220, easing: "ease-out" },
        );
      positions.current.set(element.dataset.id, top);
    }
  }, [room.nextUp]);
  const command = (path, method = "POST", body = {}, revision = true) =>
    run(async () => {
      setBusy(true);
      try {
        const result = await api(`/lounges/${room.loungeId}${path}`, {
          method,
          body: {
            ...body,
            ...(revision ? { expectedRevision: room.revision } : {}),
          },
        });
        if (result.inviteCode) setInvite(result.inviteCode);
      } finally {
        setBusy(false);
      }
    });
  return (
    <>
      {room.mutationFrozen && (
        <div role="status" className="alert frozen">
          {room.degraded
            ? "Persistence unavailable. Playback and queue changes are paused."
            : "Host disconnected. Playback and queue changes are frozen."}
        </div>
      )}
      {room.recovery && (
        <div role="status" className="notice">
          Recovered through durable revision {room.recovery.durableRevision}.
          Unflushed changes may have been lost. The Host must resume.
        </div>
      )}
      <div className="console-grid">
        <Player
          room={room}
          token={session.accessToken}
          clock={clock}
          connected={connection === "Connected"}
        />
        <section className="panel">
          <h2>Room controls</h2>
          {dj && (
            <div className="control-row">
              <button
                disabled={busy || disabled}
                onClick={() =>
                  command("/playback", "POST", {
                    action: room.nowPlaying ? "resume" : "start",
                  })
                }
              >
                Play
              </button>
              <button
                disabled={busy || disabled || !room.nowPlaying}
                onClick={() =>
                  command("/playback", "POST", { action: "pause" })
                }
              >
                Pause
              </button>
              <button
                disabled={busy || disabled || !room.nextUp.length}
                onClick={() =>
                  command("/playback", "POST", { action: "advance" })
                }
              >
                Skip / Advance
              </button>
            </div>
          )}
          {host && (
            <div className="control-row">
              <button
                disabled={busy}
                onClick={() =>
                  command("/settings", "PATCH", { locked: !room.locked })
                }
              >
                {room.locked ? "Unlock room" : "Lock room"}
              </button>
              <button
                disabled={busy}
                onClick={() => command("/invites/rotate")}
              >
                Rotate invite
              </button>
            </div>
          )}
          <button
            className="text-button"
            onClick={() =>
              run(async () => {
                await api(`/lounges/${room.loungeId}/leave`, {
                  method: "POST",
                  body: {},
                });
                setRoom(null);
              })
            }
          >
            Leave lounge
          </button>
          <p className="subtle">
            {room.participantCount} online · {room.members.length} members
          </p>
          <div className="members">
            {room.members.map((m) => (
              <div className="member" key={m.userId}>
                <div>
                  <strong>{m.displayName}</strong>
                  <small>
                    {m.role.replace("_", "-")} ·{" "}
                    {room.presentUserIds.includes(m.userId)
                      ? "Online"
                      : "Offline"}
                    {m.muted ? " · Muted" : ""}
                  </small>
                </div>
                {host && m.userId !== session.user.id && (
                  <details>
                    <summary>Manage {m.displayName}</summary>
                    <button
                      onClick={() =>
                        command(`/members/${m.userId}`, "PATCH", {
                          muted: !m.muted,
                        })
                      }
                    >
                      {m.muted ? "Unmute" : "Mute"}
                    </button>
                    <button
                      onClick={() =>
                        command(`/members/${m.userId}`, "PATCH", {
                          role: m.role === "co_dj" ? "listener" : "co_dj",
                        })
                      }
                    >
                      {m.role === "co_dj" ? "Make listener" : "Make Co-DJ"}
                    </button>
                    <button
                      onClick={() =>
                        command("/host-transfer", "POST", { userId: m.userId })
                      }
                    >
                      Transfer Host
                    </button>
                    <button
                      onClick={() =>
                        command(`/members/${m.userId}`, "PATCH", {
                          removed: true,
                        })
                      }
                    >
                      Remove member
                    </button>
                  </details>
                )}
              </div>
            ))}
          </div>
          <div className="sync-footer">
            Snapshot revision {room.revision} · {room.status}
            <br />
            <span>Durable revision {room.durableRevision}</span>
          </div>
        </section>
      </div>
      <section className="panel queue-panel" data-room-revision={room.revision}>
        <div className="section-top">
          <h2>Next Up</h2>
          <span className="count">{room.nextUp.length} / 200</span>
        </div>
        {dj && (
          <form
            className="enqueue-form"
            onSubmit={(event) => {
              event.preventDefault();
              const trackId = new FormData(event.currentTarget).get("trackId");
              command("/queue", "POST", { trackId });
            }}
          >
            <label>
              Add a track
              <select name="trackId" required>
                {tracks.map((t) => (
                  <option key={t.trackId} value={t.trackId}>
                    {t.title}
                    {t.profileStatus === "pending" ? " · Profile needed" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || disabled}>Add to queue</button>
          </form>
        )}
        <p className="subtle">
          Votes determine order. A reserved track plays next after compatibility
          is checked again.
        </p>
        <div ref={list} className="queue-list">
          {room.nextUp.map((e, index) => (
            <div className="queue-row" data-id={e.entryId} key={e.entryId}>
              <span>{index + 1}</span>
              <div>
                <strong>{e.track.title}</strong>
                <small>
                  {e.track.artist}
                  {room.reservedEntryId === e.entryId ? " · Reserved next" : ""}
                </small>
              </div>
              <button
                disabled={busy || disabled}
                aria-pressed={e.voters.includes(session.user.id)}
                aria-label={`Upvote ${e.track.title}`}
                onClick={() =>
                  command(
                    `/queue/${e.entryId}/vote`,
                    "PUT",
                    { upvoted: !e.voters.includes(session.user.id) },
                    false,
                  )
                }
              >
                ↑ {e.voteCount}
              </button>
              {dj && (
                <>
                  <button
                    disabled={busy || disabled}
                    onClick={() => command(`/queue/${e.entryId}/promote`)}
                  >
                    Reserve next
                  </button>
                  <button
                    disabled={busy || disabled}
                    onClick={() => command(`/queue/${e.entryId}`, "DELETE")}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {!room.nextUp.length && (
          <p className="empty">The queue is empty. Add the next track.</p>
        )}
      </section>
      <AiConsole
        room={room}
        dj={dj}
        disabled={busy || disabled}
        api={api}
        run={run}
        command={command}
      />
    </>
  );
}
