import React, { useEffect, useState } from "react";
export default function Catalog({ tracks, token, api, isAdmin, reload }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function preview(track) {
    setLoading(true);
    setError("");
    setSelected(track);
    setUrl("");
    try {
      const response = await fetch(`/api/v1/assets/${track.assetId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok)
        throw new Error(
          "Unable to load this file. Refresh your session and try again.",
        );
      setUrl(URL.createObjectURL(await response.blob()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    try {
      await api(`/tracks/${editing.trackId}/acoustic-profile`, {
        method: "PUT",
        body: {
          expectedProfileVersion: editing.profileVersion,
          acoustic: {
            bpm: Number(data.bpm),
            camelotKey: String(data.camelotKey).trim().toUpperCase(),
            energy: Number(data.energy),
            valence: Number(data.valence),
          },
          timeline: editing.timeline,
        },
      });
      await reload();
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
  }
  const filtered = tracks.filter((t) =>
    `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel library">
      <div className="section-top">
        <h2>Local music library</h2>
        <span className="count">
          {tracks.filter((t) => t.assetId).length} audio files
        </span>
      </div>
      <p className="subtle">
        Private local previews. Tracks marked “Profile needed” have no verified
        acoustic values.
      </p>
      <label>
        Search library
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a song or artist"
        />
      </label>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {selected && (
        <div className="preview">
          <strong>{selected.title}</strong>
          {loading ? (
            <p>Loading audio…</p>
          ) : (
            url && (
              <audio
                aria-label={`Preview ${selected.title}`}
                controls
                src={url}
              />
            )
          )}
          <p className="form-footnote">
            Local preview only; does not change the lounge’s playback state.
          </p>
        </div>
      )}
      <div className="library-list">
        {filtered.map((track) => (
          <div className="library-row" key={track.trackId}>
            <div>
              <strong>{track.title}</strong>
              <small>
                {track.artist} · {Math.floor(track.durationSeconds / 60)}:
                {String(Math.floor(track.durationSeconds % 60)).padStart(
                  2,
                  "0",
                )}{" "}
                ·{" "}
                {track.profileStatus === "pending"
                  ? "Profile needed"
                  : `${track.acoustic?.bpm} BPM / ${track.acoustic?.camelotKey}`}
              </small>
            </div>
            <div>
              {track.assetId && (
                <button
                  className="text-button"
                  disabled={loading}
                  onClick={() => preview(track)}
                >
                  Preview
                </button>
              )}
              {isAdmin && (
                <button
                  className="text-button"
                  onClick={() => setEditing(track)}
                >
                  Edit profile
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <form onSubmit={save} className="profile-editor">
          <h3>Profile · {editing.title}</h3>
          <p className="subtle">
            Enter authored or measured values. No acoustic values are guessed
            during import.
          </p>
          {["bpm", "camelotKey", "energy", "valence"].map((field) => (
            <label key={field}>
              {field}
              <input
                name={field}
                defaultValue={editing.acoustic?.[field] ?? ""}
                key={`${editing.trackId}-${field}`}
                required
              />
            </label>
          ))}
          <button className="primary">Save acoustic profile</button>
          <button
            type="button"
            className="text-button"
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
