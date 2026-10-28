import React, { useEffect, useRef, useState } from "react";
export function SessionAnalytics({ api, loungeId }) {
  const [summary, setSummary] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const current = useRef(loungeId),
    request = useRef(0);
  current.current = loungeId;
  useEffect(() => {
    setSummary(null);
    setError("");
  }, [loungeId]);
  async function load() {
    const requestId = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await api(`/lounges/${loungeId}/analytics`);
      if (current.current === loungeId && request.current === requestId)
        setSummary(result);
    } catch (e) {
      if (current.current === loungeId && request.current === requestId)
        setError(e.message);
    } finally {
      if (current.current === loungeId && request.current === requestId)
        setLoading(false);
    }
  }
  return (
    <details
      className="panel"
      onToggle={(event) => {
        if (event.currentTarget.open) load();
      }}
    >
      <summary>Session analytics</summary>
      {loading && <p role="status">Loading session recap…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={load}>
            Retry session recap
          </button>
        </p>
      )}
      {summary?.summaryStatus === "complete" ? (
        <>
          <h3>Your session recap</h3>
          <dl className="session-recap">
            <div>
              <dt>Session duration</dt>
              <dd>
                {Math.floor(summary.durationSeconds / 60)}m{" "}
                {Math.floor(summary.durationSeconds % 60)}s
              </dd>
            </div>
            <div>
              <dt>Peak listeners</dt>
              <dd>{summary.peakParticipants}</dd>
            </div>
            <div>
              <dt>Battles opened</dt>
              <dd>{summary.battleCount}</dd>
            </div>
            <div>
              <dt>Questions asked</dt>
              <dd>{summary.questionCount}</dd>
            </div>
          </dl>
          <p className="subtle">
            Duration includes pauses from first playback to session end. Track
            history lists each playback in order.
          </p>
          <h3>Track history</h3>
          {summary.trackHistory.length ? (
            <ol className="recap-scroll">
              {summary.trackHistory.map((track) => (
                <li key={track.playbackId}>
                  <strong>{track.title}</strong> — {track.artist}
                  <br />
                  <small>
                    Started{" "}
                    <time dateTime={track.startedAt}>
                      {new Date(track.startedAt).toLocaleTimeString()}
                    </time>
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No tracks were started during this session.</p>
          )}
          <h3>Soundclash results</h3>
          {!Array.isArray(summary.battleOutcomes) ? (
            <p>Battle results are unavailable in this older recap.</p>
          ) : (
            <>
              <p>
                {summary.resolvedBattleCount} battles resolved
                {summary.battleOutcomesTruncated
                  ? "; showing the latest 100 results"
                  : ""}
                .
              </p>
              <ol className="recap-scroll">
                {summary.battleOutcomes.map((battle, index) => (
                  <li key={`${battle.at}-${index}`}>
                    <strong>{battle.title}</strong> —{" "}
                    {battle.applicationStatus === "reserved"
                      ? "Reserved next"
                      : "Queued for later"}
                    <br />
                    <small>{battle.reason}</small>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h3>Sentiment timeline</h3>
          <div className="recap-scroll">
            {summary.sentimentTimeline.map((sample, index) => (
              <p key={index}>
                <time dateTime={sample.at}>
                  {new Date(sample.at).toLocaleTimeString()}
                </time>{" "}
                <meter
                  min="-1"
                  max="1"
                  value={sample.rollingScore}
                  aria-label={`Sentiment ${sample.rollingScore}`}
                />{" "}
                {sample.rollingScore}
              </p>
            ))}
          </div>
          {!summary.sentimentTimeline.length && (
            <p>No sentiment samples were recorded.</p>
          )}
        </>
      ) : (
        !loading &&
        !error && (
          <p className="subtle">
            The summary becomes available after the Host ends the session.{" "}
            <button type="button" onClick={load}>
              Refresh session recap
            </button>
          </p>
        )
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
