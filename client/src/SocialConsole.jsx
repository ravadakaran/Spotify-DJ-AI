import TrackPicker from "./TrackPicker.jsx";
import React, { useEffect, useRef, useState } from "react";
const emojis = ["👍", "❤️", "🔥", "🎵"];
export default function SocialConsole({
  room,
  session,
  tracks,
  api,
  socketRef,
  clock,
  connected,
  dj,
}) {
  const [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]),
    [cursor, setCursor] = useState(undefined),
    [typing, setTyping] = useState({}),
    [now, setNow] = useState(room.serverTime);
  const lastTyping = useRef(0);
  const member = room.members.find((m) => m.userId === session.user.id);
  const blocked = !connected || room.degraded;
  const battle = room.battle;
  useEffect(() => {
    const socket = socketRef.current;
    const receive = ({ loungeId, payload }) => {
      if (loungeId !== room.loungeId) return;
      setTyping((old) => ({
        ...old,
        [payload.userId]: payload.active ? payload.expiresAt : 0,
      }));
    };
    socket?.on("lounge.chat.typing", receive);
    const reaction = ({ loungeId, payload }) => {
      if (loungeId === room.loungeId)
        setHistory((old) =>
          old.map((m) =>
            m.messageId === payload.messageId
              ? { ...m, reactions: payload.reactions }
              : m,
          ),
        );
    };
    socket?.on("lounge.chat.reaction", reaction);
    const timer = setInterval(
      () =>
        setNow(
          clock.current.serverAt +
            performance.now() -
            clock.current.monotonicAt,
        ),
      250,
    );
    return () => {
      socket?.off("lounge.chat.typing", receive);
      socket?.off("lounge.chat.reaction", reaction);
      clearInterval(timer);
    };
  }, [room.loungeId, socketRef, clock, connected]);
  async function action(path, method, payload, revision = false) {
    setBusy(true);
    setError("");
    try {
      return await api(`/lounges/${room.loungeId}${path}`, {
        method,
        body: {
          ...payload,
          ...(revision ? { expectedRevision: room.revision } : {}),
        },
      });
    } catch (e) {
      if (
        ["STALE_REVISION", "STALE_PROPOSAL", "STALE_GENERATION"].includes(
          e.code,
        )
      ) {
        socketRef.current?.emit("lounge.resync", { loungeId: room.loungeId });
        setError(
          "The lounge changed. Refreshing now; your draft and selection are kept. Review the current state, then submit again.",
        );
      } else setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const battleAction = (
    suffix,
    payload = {},
    revision = true,
    method = "POST",
  ) =>
    action(
      `/battles/${battle.battleId}/${suffix}`,
      method,
      payload,
      revision,
    ).catch(() => {});
  const messages = [
    ...new Map(
      [...history, ...(room.chat || [])].map((m) => [m.messageId, m]),
    ).values(),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const counts =
    battle?.candidates.map(
      (c) =>
        Object.values(battle.votes).filter((id) => id === c.candidateId).length,
    ) || [];
  return (
    <div className="console-grid social-console">
      <section
        className="panel chat-panel"
        id="room-chat"
        aria-labelledby="chat-heading"
      >
        <h2 id="chat-heading">Room chat</h2>
        <p className="subtle" data-testid="sentiment">
          Room mood:{" "}
          {room.sentiment.rollingScore > 0.15
            ? "Positive"
            : room.sentiment.rollingScore < -0.15
              ? "Negative"
              : "Neutral"}{" "}
          · {room.sentiment.sampleSize} participants in the last 30 seconds
        </p>
        <p className="subtle">
          English text estimate. Sarcasm and other languages may be missed.
        </p>
        {cursor !== null && (
          <button
            className="text-button"
            disabled={busy || blocked}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const page = await api(
                  `/lounges/${room.loungeId}/chat${cursor ? `?cursor=${cursor}` : ""}`,
                );
                setHistory((old) => [...page.items, ...old]);
                setCursor(page.nextCursor);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Load older messages
          </button>
        )}
        <div className="chat-stream" aria-label="Chat messages">
          {!messages.length && (
            <p className="empty">
              No messages yet. Tell the room how the set feels.
            </p>
          )}
          {messages.map((m) => (
            <article className="chat-message" key={m.messageId}>
              <strong>{m.displayName}</strong>{" "}
              <small>
                {m.msgType === "dj_announcement"
                  ? "DJ announcement · template"
                  : m.sentimentBucket}
              </small>
              <p>{m.body}</p>
              <div className="control-row">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    aria-label={`React ${emoji} to ${m.displayName}: ${m.body.slice(0, 35)}`}
                    aria-pressed={(m.reactions[emoji] || []).includes(
                      session.user.id,
                    )}
                    disabled={busy || blocked || member?.muted}
                    onClick={() =>
                      action(`/chat/${m.messageId}/reactions`, "PUT", {
                        emoji,
                        active: !(m.reactions[emoji] || []).includes(
                          session.user.id,
                        ),
                      }).catch(() => {})
                    }
                  >
                    {emoji} {(m.reactions[emoji] || []).length}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
        <p className="typing-status" aria-live="polite">
          {room.members
            .filter(
              (m) =>
                m.userId !== session.user.id &&
                !m.muted &&
                typing[m.userId] > now,
            )
            .map((m) => m.displayName)
            .join(", ")}
          {room.members.some(
            (m) =>
              m.userId !== session.user.id &&
              !m.muted &&
              typing[m.userId] > now,
          )
            ? " is typing…"
            : ""}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await action("/chat", "POST", { body });
              setBody("");
              socketRef.current?.emit("lounge.chat.typing", { active: false });
            } catch {
              /* Keep draft for retry. */
            }
          }}
        >
          <label>
            Message
            <textarea
              aria-label="Message"
              value={body}
              maxLength={1000}
              required
              disabled={blocked || member?.muted}
              onChange={(e) => {
                setBody(e.target.value);
                if (Date.now() - lastTyping.current > 1100) {
                  lastTyping.current = Date.now();
                  socketRef.current?.emit("lounge.chat.typing", {
                    active: true,
                  });
                }
              }}
            />
          </label>
          <div className="control-row">
            <button disabled={busy || blocked || member?.muted || !body.trim()}>
              Send message
            </button>
            <small>{body.length} / 1,000</small>
          </div>
          {member?.muted && (
            <p className="notice">
              You are muted. Chat and reactions are unavailable.
            </p>
          )}
        </form>
      </section>
      <section
        className="panel battle-panel"
        id="room-battle"
        aria-labelledby="battle-heading"
      >
        <h2 id="battle-heading">Soundclash</h2>
        <p className="subtle">
          Submit a track, then vote for the next selection. Incompatible winners
          stay in Next Up for later.
        </p>
        {!room.settings.soundclashEnabled && (
          <p className="notice">Soundclash is disabled for this lounge.</p>
        )}
        {room.settings.soundclashEnabled &&
          (!battle ||
            ["draft", "resolved", "cancelled"].includes(battle.status)) && (
            <form
              className="enqueue-form"
              onSubmit={(e) => {
                e.preventDefault();
                action("/battles/candidates", "POST", {
                  trackId: new FormData(e.currentTarget).get("trackId"),
                }).catch(() => {});
              }}
            >
              <TrackPicker
                room={room}
                api={api}
                tracks={tracks}
                label="Battle track"
              />
              <button
                disabled={
                  busy ||
                  blocked ||
                  room.mutationFrozen ||
                  (battle?.status === "draft" &&
                    (battle.candidates.length >= 4 ||
                      battle.candidates.some(
                        (c) => c.submitterId === session.user.id,
                      )))
                }
              >
                Submit candidate
              </button>
            </form>
          )}
        {!battle && (
          <p className="empty">
            Two to four members can submit one distinct track each.
          </p>
        )}
        {battle && (
          <>
            <p role="status">
              {battle.status === "open"
                ? `Voting closes in ${Math.max(0, Math.ceil((battle.closesAt - now) / 1000))}s`
                : battle.status === "awaiting_tie"
                  ? "Tied vote · Host or Co-DJ chooses a leader"
                  : `Battle ${battle.status}`}
            </p>
            {battle.candidates.map((c, i) => (
              <div
                className={`battle-candidate${battle.winnerCandidateId === c.candidateId ? " is-winner" : ""}`}
                key={c.candidateId}
              >
                <strong>{c.track.title}</strong>
                {battle.winnerCandidateId === c.candidateId && (
                  <span className="winner-label">
                    Winner ·{" "}
                    {battle.applicationStatus === "reserved"
                      ? "Reserved next"
                      : "Queued for later"}
                  </span>
                )}
                <span>{counts[i]} votes</span>
                <meter
                  aria-label={`Votes for ${c.track.title}`}
                  min="0"
                  max={Math.max(1, room.members.length)}
                  value={counts[i]}
                />
                <div className="control-row">
                  {battle.status === "open" && (
                    <button
                      aria-pressed={
                        battle.votes[session.user.id] === c.candidateId
                      }
                      disabled={
                        busy ||
                        blocked ||
                        room.mutationFrozen ||
                        now >= battle.closesAt
                      }
                      onClick={() =>
                        battleAction(
                          "vote",
                          { candidateId: c.candidateId },
                          false,
                          "PUT",
                        )
                      }
                    >
                      Vote for {c.track.title}
                    </button>
                  )}
                  {battle.status === "awaiting_tie" &&
                    dj &&
                    counts[i] === Math.max(...counts) && (
                      <button
                        disabled={busy || blocked || room.mutationFrozen}
                        onClick={() =>
                          battleAction("resolve", {
                            winnerCandidateId: c.candidateId,
                          })
                        }
                      >
                        Choose {c.track.title}
                      </button>
                    )}
                </div>
              </div>
            ))}
            {dj && battle.status === "draft" && (
              <form
                className="enqueue-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  battleAction("open", {
                    durationSeconds: Number(
                      new FormData(e.currentTarget).get("duration"),
                    ),
                  });
                }}
              >
                <label>
                  Voting seconds
                  <input
                    name="duration"
                    type="number"
                    min="10"
                    max="120"
                    defaultValue="30"
                    required
                  />
                </label>
                <button
                  disabled={
                    busy ||
                    blocked ||
                    room.mutationFrozen ||
                    battle.candidates.length < 2
                  }
                >
                  Open voting
                </button>
              </form>
            )}
            {dj &&
              ["draft", "open", "awaiting_tie"].includes(battle.status) && (
                <div className="control-row">
                  <button
                    disabled={busy || blocked || room.mutationFrozen}
                    onClick={() => battleAction("cancel")}
                  >
                    Cancel battle
                  </button>
                  {battle.status === "open" && now >= battle.closesAt && (
                    <button
                      disabled={busy || blocked || room.mutationFrozen}
                      onClick={() => battleAction("resolve")}
                    >
                      Resolve battle
                    </button>
                  )}
                </div>
              )}
            {battle.announcement && (
              <p className="notice" role="status">
                {battle.announcement}
              </p>
            )}
          </>
        )}
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
