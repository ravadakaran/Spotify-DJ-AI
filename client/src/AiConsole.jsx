import React, { useEffect, useState } from "react";

function Citations({ items = [] }) {
  return (
    <div className="citations">
      {items.map((item) => (
        <details key={item.id}>
          <summary>
            {item.sourceLabel} · v{item.profileVersion}
          </summary>
          <p>{item.text}</p>
          <small className="source-id">Source ID: {item.id}</small>
        </details>
      ))}
    </div>
  );
}
export default function AiConsole({ room, dj, disabled, api, run, command }) {
  const [answer, setAnswer] = useState(null),
    [busy, setBusy] = useState(false);
  const p = room.segueProposal;
  const proposedTrack = room.nextUp.find(
    (entry) => entry.trackId === p?.selectedTrackId,
  )?.track;
  useEffect(() => {
    setAnswer(null);
  }, [room.loungeId, room.nowPlaying?.playbackId]);
  return (
    <section
      className="panel ai-panel"
      id="room-ai"
      aria-labelledby="ai-heading"
    >
      <h2 id="ai-heading">
        AI DJ <span className="heading-note">Grounded in your music</span>
      </h2>
      <p className="subtle">
        Suggestions require approval. Template mode uses authored facts; it is
        not a model-generated answer.
      </p>
      {dj && (
        <button
          disabled={disabled || !room.nowPlaying}
          onClick={() => command("/ai/segue")}
        >
          Suggest segue
        </button>
      )}
      {p && (
        <div role="status" className="ai-answer">
          {proposedTrack && <h3>Up next: {proposedTrack.title}</h3>}
          <p>{p.transitionScript}</p>
          <small>
            {p.generationMode} · {p.status}
            {p.fallbackReason ? ` · ${p.fallbackReason}` : ""}
          </small>
          {p.matchReason && (
            <p>
              Tempo delta {p.matchReason.bpmDeltaPct.toFixed(2)}% ·{" "}
              {p.matchReason.multiplier}× time · {p.matchReason.camelotRelation}{" "}
              key · score {p.score.toFixed(3)}
            </p>
          )}
          <Citations items={p.citations} />
          {dj && p.status === "pending" && (
            <div className="control-row">
              <button
                disabled={disabled || p.revision !== room.revision}
                onClick={() =>
                  command(`/ai/segue/${p.proposalId}/decision`, "POST", {
                    decision: "approve",
                  })
                }
              >
                Approve next track
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  command(`/ai/segue/${p.proposalId}/decision`, "POST", {
                    decision: "reject",
                  })
                }
              >
                Reject
              </button>
              {p.revision !== room.revision && (
                <p>Room changed. Request a fresh suggestion.</p>
              )}
            </div>
          )}
          {p.status === "approved" && (
            <p>
              Reserved next. Starts automatically when this track ends, after
              the final compatibility check. Use Skip / Advance to start sooner.
            </p>
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const question = new FormData(event.currentTarget).get("question");
          run(async () => {
            setBusy(true);
            try {
              setAnswer(
                await api(`/lounges/${room.loungeId}/ai/questions`, {
                  method: "POST",
                  body: { trackId: room.nowPlaying.trackId, question },
                }),
              );
            } finally {
              setBusy(false);
            }
          });
        }}
      >
        <label>
          Ask about the current track
          <input
            name="question"
            required
            maxLength={500}
            placeholder="What is the tempo?"
          />
        </label>
        <button disabled={busy || disabled || !room.nowPlaying}>
          Ask AI DJ
        </button>
      </form>
      {answer && answer.trackId === room.nowPlaying?.trackId && (
        <div role="status" className="ai-answer">
          <p>{answer.answer}</p>
          <small>
            {answer.generationMode}
            {answer.fallbackReason ? ` · ${answer.fallbackReason}` : ""}
          </small>
          <Citations items={answer.citations} />
        </div>
      )}
    </section>
  );
}
