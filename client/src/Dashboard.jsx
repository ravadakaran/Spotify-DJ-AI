import React, { useEffect, useState } from "react";
export function SessionAnalytics({ api, loungeId }) {
  const [summary, setSummary] = useState(null),
    [error, setError] = useState("");
  return (
    <details
      className="panel"
      onToggle={(e) => {
        if (e.currentTarget.open)
          api(`/lounges/${loungeId}/analytics`)
            .then(setSummary)
            .catch((e) => setError(e.message));
      }}
    >
      <summary>Session analytics</summary>
      {error && <p role="alert">{error}</p>}
      {summary?.summaryStatus === "complete" ? (
        <>
          <p>
            {summary.durationSeconds.toFixed(1)} seconds · Peak{" "}
            {summary.peakParticipants} listeners · {summary.battleCount} battles
            · {summary.questionCount} questions
          </p>
          <h3>Sentiment timeline</h3>
          <div style={{ maxHeight: 220, overflow: "auto" }}>
            {summary.sentimentTimeline.map((s, i) => (
              <p key={i}>
                <time>{s.at}</time>{" "}
                <meter
                  min="-1"
                  max="1"
                  value={s.rollingScore}
                  aria-label={`Sentiment ${s.rollingScore}`}
                />{" "}
                {s.rollingScore}
              </p>
            ))}
          </div>
          <h3>Track history</h3>
          <ol>
            {summary.trackHistory.map((t) => (
              <li key={t.playbackId}>
                {t.title} — {t.artist}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="subtle">
          The summary becomes available after the Host ends the session.
        </p>
      )}
    </details>
  );
}
export default function Dashboard({ api, run, tracks, isAdmin }) {
  const [data, setData] = useState(null),
    [rail, setRail] = useState(null),
    [job, setJob] = useState(null),
    [error, setError] = useState("");
  async function reload() {
    const [d, r] = await Promise.all([
      api("/users/me/dashboard"),
      api("/users/me/recommendations"),
    ]);
    setData(d);
    setRail(r);
  }
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  const title = (id) =>
    tracks.find((t) => t.trackId === id || t._id === id)?.title || id;
  return (
    <section className="panel personal-dashboard">
      <div className="section-top">
        <h2>Your listening</h2>
        <button className="secondary" onClick={() => run(reload)}>
          Refresh listening
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p>
        {data?.tasteProfile.bpm == null
          ? "Listen in a lounge to build your taste profile."
          : `Your listening average: ${data.tasteProfile.bpm.toFixed(1)} BPM · Energy ${data.tasteProfile.energy.toFixed(2)}`}
      </p>
      <h3>Recommended for you</h3>
      <p className="subtle">
        {rail?.fallbackReason === "MODEL_NOT_FITTED"
          ? "Catalog suggestions until an administrator fits a model."
          : rail?.fallbackReason === "COLD_START"
            ? "Popular in the catalog. Listen or like tracks to personalize this rail."
            : "Based on acoustic fit and shared listening."}
      </p>
      {rail?.items.map((t) => (
        <p key={t.trackId}>
          <strong>{t.title}</strong> — {t.artist}
          <br />
          <small>{t.reason}</small>
        </p>
      ))}
      {!rail?.items.length && <p>No unseen recommendations available yet.</p>}
      <details>
        <summary>Listening history</summary>
        {data?.history.map((r) => (
          <p key={r._id}>
            {title(r.trackId)} · {r.playedSeconds.toFixed(1)} seconds{" "}
            {r.completed ? "· Completed" : ""} {r.liked ? "· Liked" : ""}
          </p>
        ))}
      </details>
      {isAdmin && (
        <div>
          <h3>Recommendation training</h3>
          <button
            onClick={() =>
              run(async () =>
                setJob(
                  await api("/admin/recommendation-jobs", {
                    method: "POST",
                    body: {},
                  }),
                ),
              )
            }
          >
            Fit recommendation model
          </button>
          {job && (
            <>
              <p role="status">
                {job.status} {job.modelVersion} {job.failureReason}
              </p>
              <button
                className="secondary"
                onClick={() =>
                  run(async () => {
                    setJob(
                      await api(
                        `/admin/recommendation-jobs/${job.jobId || job._id}`,
                      ),
                    );
                    await reload();
                  })
                }
              >
                Check training status
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
