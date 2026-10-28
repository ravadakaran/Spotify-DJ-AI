import TrackPicker from "./TrackPicker.jsx";
import FirstSteps from "./FirstSteps.jsx";
import React, { useEffect, useRef, useState } from "react";
import AiConsole from "./AiConsole.jsx";
import { SessionAnalytics } from "./Dashboard.jsx";
import SocialConsole from "./SocialConsole.jsx";
import { Icon, TrackArt } from "./StudioVisuals.jsx";
import { CompatibilityText, useCompatibility } from "./Compatibility.jsx";
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
function Player({
  room,
  token,
  clock,
  connected,
  api,
  dj,
  busy,
  disabled,
  command,
  onAudioState,
  audioActions,
}) {
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
  const [liked, setLiked] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const deviceBlocked = useRef(false);
  const [reload, setReload] = useState(0);
  const apiRef = useRef(api),
    likedRef = useRef(false);
  apiRef.current = api;
  useEffect(() => {
    likedRef.current = false;
    setLiked(false);
    const heartbeat = () => {
      const p = latest.current.nowPlaying,
        element = audio.current;
      if (
        p &&
        element &&
        !element.paused &&
        !p.paused &&
        element.readyState >= 2
      )
        apiRef
          .current(
            `/lounges/${latest.current.loungeId}/playbacks/${p.playbackId}/interaction`,
            {
              method: "PUT",
              body: { listenedThroughSeconds: 10 },
            },
          )
          .catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 10000);
    return () => clearInterval(timer);
  }, [playback?.playbackId]);
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
    setMediaError("");
    setBlocked(false);
    deviceBlocked.current = false;
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
        if (!controller.signal.aborted && e.name !== "AbortError")
          setMediaError(e.message);
      });
    return () => {
      controller.abort();
      element.pause();
      element.removeAttribute("src");
      element.load();
      if (url) URL.revokeObjectURL(url);
    };
  }, [playback?.playbackId, playback?.assetId, token, unlocked, reload]);
  useEffect(() => {
    const element = audio.current;
    if (!loaded || !unlocked) return;
    let active = true;
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
      else if (element.paused && !deviceBlocked.current)
        element
          .play()
          .then(() => {
            if (active) setBlocked(false);
          })
          .catch(() => {
            if (active) {
              deviceBlocked.current = true;
              setBlocked(true);
            }
          });
    };
    element.addEventListener("loadedmetadata", sync);
    sync();
    const timer = setInterval(sync, 500);
    return () => {
      active = false;
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
      setBlocked(false);
      deviceBlocked.current = false;
      if (audio.current.src && !latest.current.nowPlaying?.paused)
        await audio.current.play();
    } catch {
      deviceBlocked.current = true;
      setBlocked(true);
    }
  }
  const offset = elapsed(playback, now);
  const audioState =
    room.status === "ended"
      ? {
          message: "Session ended",
          hint: "Open Session analytics for the recap.",
        }
      : room.degraded
        ? {
            message: "Playback paused · saving unavailable",
            hint: "Wait for persistence recovery before resuming.",
          }
        : !connected
          ? {
              message: "Connection lost · reconnecting",
              hint: "Wait for the lounge to synchronize before resuming.",
            }
          : room.mutationFrozen
            ? {
                message: "Host disconnected · playback frozen",
                hint: "The Host must reconnect and resume playback.",
              }
            : mediaError
              ? {
                  message: "Audio unavailable",
                  hint: mediaError,
                  action: "Retry audio",
                }
              : blocked
                ? {
                    message: "Browser playback blocked",
                    hint: "Enable audio on this device to continue.",
                    action: "Enable audio again",
                  }
                : !unlocked
                  ? {
                      message: "Audio not enabled",
                      hint: "Enable audio on this device to hear the room.",
                      action: "Enable audio",
                    }
                  : !playback
                    ? {
                        message: "Waiting for the Host",
                        hint: "The Host starts the selected track.",
                      }
                    : !playback.assetId
                      ? {
                          message: "No audio asset",
                          hint: "Ask an administrator to prepare this track.",
                        }
                      : !loaded
                        ? {
                            message: "Loading audio…",
                            hint: "Fetching the private audio file.",
                          }
                        : playback.paused
                          ? {
                              message:
                                offset >= playback.durationSeconds
                                  ? "Track ended"
                                  : "Room paused",
                              hint:
                                offset >= playback.durationSeconds
                                  ? "Check the next track’s audio and compatibility before advancing."
                                  : "The Host or Co-DJ can resume playback.",
                            }
                          : {
                              message: "Playing",
                              hint: "Following the lounge playback clock.",
                            };
  useEffect(() => {
    onAudioState({ ...audioState, enabled: unlocked });
  }, [
    audioState.message,
    audioState.hint,
    audioState.action,
    unlocked,
    onAudioState,
  ]);
  useEffect(() => {
    audioActions.current = {
      recover:
        audioState.action === "Retry audio"
          ? () => setReload((n) => n + 1)
          : unlock,
    };
  });
  return (
    <section className="panel player" id="room-player" aria-label="Now playing">
      <div className="player-topline">
        <span className="pill live">Now playing</span>
        <span className="player-mode">Private session</span>
      </div>
      <TrackArt seed={playback?.trackId || "studio"} />
      <div className="player-track">
        <h2>{playback?.title || "Ready when you are"}</h2>
        <p className="subtle">
          {playback?.artist || "The Host starts the selected track."}
        </p>
      </div>
      <audio
        ref={audio}
        aria-label="Lounge audio"
        onError={() =>
          setMediaError(
            "This file could not be decoded. Retry, or ask an administrator to check the audio.",
          )
        }
      />
      <progress
        aria-label="Track progress"
        max={playback?.durationSeconds || 1}
        value={offset}
      />
      <p className="playback-time">
        {time(offset)} / {time(playback?.durationSeconds || 0)} ·{" "}
        {playback?.paused ? "Paused" : playback ? "Playing" : "Scheduled"}
      </p>
      <div
        className="playback-status"
        role="status"
        data-testid="playback-status"
      >
        <strong>{audioState.message}</strong>
        <small>{audioState.hint}</small>
        {audioState.action === "Retry audio" && (
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Retry audio
          </button>
        )}
      </div>
      {dj && (
        <div className="transport">
          <button
            className="transport-play"
            disabled={busy || disabled}
            onClick={() =>
              command("/playback", "POST", {
                action: !playback
                  ? "start"
                  : playback.paused
                    ? "resume"
                    : "pause",
              })
            }
          >
            <Icon name={playback && !playback.paused ? "pause" : "play"} />
            {playback && !playback.paused ? "Pause" : "Play"}
          </button>
          <button
            disabled={busy || disabled || !room.nextUp.length}
            onClick={() => command("/playback", "POST", { action: "advance" })}
          >
            <Icon name="next" />
            Skip / Advance
          </button>
        </div>
      )}
      <div className="player-actions">
        <button className="secondary" onClick={unlock}>
          <Icon name="volume" size={17} />
          {unlocked ? "Enable audio again" : "Enable audio"}
        </button>
        {playback && (
          <button
            className="secondary"
            aria-pressed={liked}
            onClick={async () => {
              const liked = !likedRef.current;
              try {
                await api(
                  `/lounges/${room.loungeId}/playbacks/${playback.playbackId}/interaction`,
                  { method: "PUT", body: { listenedThroughSeconds: 0, liked } },
                );
                likedRef.current = liked;
                setLiked(liked);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Icon name="heart" size={17} />
            {liked ? "Liked" : "Like"}
          </button>
        )}
      </div>
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
  socketRef,
}) {
  const member = room.members.find((m) => m.userId === session.user.id),
    host = member?.role === "host",
    dj = host || member?.role === "co_dj";
  const disabled =
    room.status === "ended" ||
    room.mutationFrozen ||
    connection !== "Connected";
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState("queue");
  const [audioState, setAudioState] = useState({
    message: "Audio not enabled",
    action: "Enable audio",
  });
  const audioActions = useRef(null);
  const [staleAction, setStaleAction] = useState(null);
  const queueCompatibility = useCompatibility(
    api,
    room,
    room.nextUp.map((entry) => entry.trackId),
  );
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
        setStaleAction(null);
      } catch (error) {
        if (
          ["STALE_REVISION", "STALE_PROPOSAL", "STALE_GENERATION"].includes(
            error.code,
          )
        ) {
          setStaleAction({ epoch: room.epoch, revision: room.revision });
          socketRef.current?.emit("lounge.resync", { loungeId: room.loungeId });
          return;
        }
        throw error;
      } finally {
        setBusy(false);
      }
    });
  return (
    <div className="lounge-workspace" data-active-section={activeSection}>
      <nav className="room-navigation" aria-label="Lounge sections">
        {[
          ["queue", "Queue"],
          ["chat", "Chat"],
          ["ai", "AI DJ"],
          ["battle", "Soundclash"],
          ["room", "Room"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={activeSection === id}
            onClick={() => {
              setActiveSection(id);
              if (matchMedia("(min-width: 761px)").matches)
                document.getElementById(`room-${id}`)?.scrollIntoView({
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "instant"
                    : "smooth",
                  block: "start",
                });
            }}
          >
            <Icon
              name={id === "ai" ? "spark" : id === "battle" ? "clash" : id}
              size={18}
            />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <FirstSteps room={room} host={host} audioEnabled={audioState.enabled} />
      {staleAction && (
        <div className="notice" role="status">
          <p>
            {room.epoch !== staleAction.epoch ||
            room.revision > staleAction.revision
              ? "The lounge has refreshed. Your selection is kept. Review the current track and queue, then try the action again."
              : "The lounge changed before this action completed. Synchronizing… Your selection is kept."}
          </p>
          <button
            type="button"
            onClick={() =>
              socketRef.current?.emit("lounge.resync", {
                loungeId: room.loungeId,
              })
            }
          >
            Refresh lounge
          </button>
          <button type="button" onClick={() => setStaleAction(null)}>
            Dismiss update
          </button>
        </div>
      )}
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
      <div className="console-grid listening-grid">
        <Player
          onAudioState={setAudioState}
          audioActions={audioActions}
          dj={dj}
          busy={busy}
          disabled={disabled}
          command={command}
          api={api}
          room={room}
          token={session.accessToken}
          clock={clock}
          connected={connection === "Connected"}
        />
        <section
          className="panel queue-panel"
          id="room-queue"
          aria-label="Queue"
          data-room-revision={room.revision}
        >
          <div className="section-top">
            <h2>Next Up</h2>
            <span className="count">{room.nextUp.length} / 200</span>
          </div>
          {dj && (
            <form
              className="enqueue-form"
              onSubmit={(event) => {
                event.preventDefault();
                const trackId = new FormData(event.currentTarget).get(
                  "trackId",
                );
                command("/queue", "POST", { trackId });
              }}
            >
              <TrackPicker
                room={room}
                api={api}
                tracks={tracks}
                label="Add a track"
              />
              <button disabled={busy || disabled}>Add to queue</button>
            </form>
          )}
          <p className="subtle">
            Votes determine order. A reserved track plays next after
            compatibility is checked again.
          </p>
          {room.reservedEntryId && (
            <p className="notice" data-testid="reserved-next">
              Next to play:{" "}
              {room.nextUp.find(
                (entry) => entry.entryId === room.reservedEntryId,
              )?.track.title || "Reserved track"}
              . This reservation takes priority over vote position.
            </p>
          )}
          {room.nextUp.length > 0 && (
            <small>
              Compatibility reflects the last server check
              {queueCompatibility.report
                ? ` at revision ${queueCompatibility.report.revision}`
                : ""}
              ; playback always rechecks current profiles.
            </small>
          )}
          {queueCompatibility.error && (
            <p role="status">
              Compatibility check unavailable.{" "}
              <button type="button" onClick={queueCompatibility.refresh}>
                Retry queue compatibility
              </button>
            </p>
          )}
          <div ref={list} className="queue-list">
            {room.nextUp.map((e, index) => (
              <div className="queue-row" data-id={e.entryId} key={e.entryId}>
                <span>{index + 1}</span>
                <div>
                  <strong>{e.track.title}</strong>
                  <small>
                    {e.track.artist}
                    {room.reservedEntryId === e.entryId
                      ? " · Reserved next"
                      : ""}
                  </small>
                  <small>
                    <CompatibilityText
                      item={queueCompatibility.report?.items.find(
                        (item) => item.trackId === e.trackId,
                      )}
                    />
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
      </div>
      <section className="panel room-panel" id="room-room" aria-label="Room">
        <details className="room-management">
          <summary>
            Manage room <span>Members, invites & session</span>
          </summary>
          <h2>Room controls</h2>
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
          <details className="sync-diagnostics">
            <summary>Connection diagnostics</summary>
            <div className="sync-footer">
              Snapshot revision {room.revision} · {room.status}
              <br />
              <span>Durable revision {room.durableRevision}</span>
            </div>
          </details>
          <SessionAnalytics api={api} loungeId={room.loungeId} />
          {host && room.status !== "ended" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => command("/end")}
            >
              End session
            </button>
          )}
          {room.status === "ended" && (
            <p role="status">
              Session ended. Your listening history and analytics are ready.
            </p>
          )}
        </details>
      </section>
      <AiConsole
        room={room}
        dj={dj}
        disabled={busy || disabled}
        api={api}
        run={run}
        command={command}
      />
      <SocialConsole
        key={room.loungeId}
        room={room}
        session={session}
        tracks={tracks}
        api={api}
        socketRef={socketRef}
        clock={clock}
        connected={connection === "Connected"}
        dj={dj}
      />
      <div className="mobile-mini-player">
        <TrackArt seed={room.nowPlaying?.trackId || "studio"} small />
        <div>
          <strong>{room.nowPlaying?.title || "Ready when you are"}</strong>
          <small>{audioState.message}</small>
        </div>
        {audioState.action && (
          <button
            type="button"
            aria-label={`${audioState.action} on this device`}
            onClick={() => audioActions.current?.recover()}
          >
            <Icon name="volume" />
          </button>
        )}
        {dj && (
          <button
            aria-label={
              room.nowPlaying && !room.nowPlaying.paused
                ? "Pause playback"
                : "Play playback"
            }
            disabled={busy || disabled}
            onClick={() =>
              command("/playback", "POST", {
                action: !room.nowPlaying
                  ? "start"
                  : room.nowPlaying.paused
                    ? "resume"
                    : "pause",
              })
            }
          >
            <Icon
              name={
                room.nowPlaying && !room.nowPlaying.paused ? "pause" : "play"
              }
            />
          </button>
        )}
        <button
          aria-label="Back to player"
          onClick={() => {
            setActiveSection("queue");
            requestAnimationFrame(() =>
              document
                .getElementById("room-player")
                ?.scrollIntoView({ block: "start", behavior: "instant" }),
            );
          }}
        >
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}
