import React, { useEffect, useState } from "react";
export default function Catalog({ tracks, token, api, isAdmin, reload }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [stagedAsset, setStagedAsset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  function edit(track, replace = false) {
    setEditing(track);
    setReplacing(replace);
    setStagedAsset(null);
    setRemoving(null);
    setError("");
    setNotice("");
  }
  function clearPreview() {
    setSelected(null);
    setUrl("");
  }
  async function remove() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/tracks/${removing.trackId}`, {
        method: "DELETE",
        body: { expectedProfileVersion: removing.profileVersion },
      });
      clearPreview();
      setRemoving(null);
      setNotice(
        `Track deleted.${result.assetCleanup === "shared" ? " Shared audio was kept for another track." : result.assetCleanup === "retained" ? " Audio file cleanup failed; contact the administrator." : ""}`,
      );
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
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
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    setError("");
    setNotice("");
    setBusy(true);
    try {
      let assetId = editing.assetId;
      if (replacing) {
        if (stagedAsset) assetId = stagedAsset;
        else {
          const upload = new FormData();
          for (const field of ["file", "licenseLabel", "sourceAttribution"])
            upload.append(field, form.get(field));
          const asset = await api("/assets", { method: "POST", body: upload });
          assetId = asset.assetId;
          setStagedAsset(assetId);
        }
      }
      const result = await api(`/tracks/${editing.trackId}`, {
        method: "PUT",
        body: {
          expectedProfileVersion: editing.profileVersion,
          title: data.title,
          artist: data.artist,
          assetId,
          acoustic: {
            bpm: Number(data.bpm),
            camelotKey: String(data.camelotKey).trim().toUpperCase(),
            energy: Number(data.energy),
            valence: Number(data.valence),
          },
          timeline: replacing ? [] : editing.timeline,
        },
      });
      clearPreview();
      setEditing(null);
      setStagedAsset(null);
      setNotice(
        `Track saved.${result.assetCleanup === "shared" ? " Previous audio was kept for another track." : result.assetCleanup === "retained" ? " Previous audio cleanup failed; contact the administrator." : ""}`,
      );
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
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
      {notice && <p role="status">{notice}</p>}
      {isAdmin && (
        <p className="subtle">
          End all lounges before editing, replacing or deleting tracks.
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
                  disabled={loading || busy}
                  onClick={() => preview(track)}
                >
                  Preview
                </button>
              )}
              {isAdmin && (
                <>
                  <button
                    className="text-button"
                    disabled={busy || loading}
                    onClick={() => edit(track)}
                  >
                    Edit profile
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || loading}
                    onClick={() => edit(track, true)}
                  >
                    Replace audio
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || loading}
                    onClick={() => {
                      setRemoving(track);
                      setEditing(null);
                      setError("");
                      setNotice("");
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {removing && (
        <div
          className="profile-editor"
          role="group"
          aria-label={`Delete ${removing.title}`}
        >
          <h3>Delete “{removing.title}”?</h3>
          <p>
            This removes the track from the library and deletes its audio if no
            other track uses it. Past session history is kept. This cannot be
            undone.
          </p>
          <button className="secondary" disabled={busy} onClick={remove}>
            Delete track permanently
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {editing && (
        <form
          key={`${editing.trackId}-${replacing}`}
          onSubmit={save}
          className="profile-editor"
        >
          <h3>
            {replacing ? "Replace audio" : "Edit track"} · {editing.title}
          </h3>
          <p className="subtle">
            Enter authored or measured values. No acoustic values are guessed
            during import.
          </p>
          <fieldset disabled={busy}>
            {["title", "artist"].map((field) => (
              <label key={field}>
                {field}
                <input
                  name={field}
                  defaultValue={editing[field]}
                  maxLength={160}
                  required
                />
              </label>
            ))}
            {replacing && (
              <>
                <p>
                  Upload original or licensed audio. Confirm acoustic values for
                  the new recording. Previous timeline notes will be cleared;
                  duration is read from the file.
                </p>
                <label>
                  Replacement audio
                  <input
                    type="file"
                    name="file"
                    accept="audio/wav,audio/mpeg,audio/mp4,.m4a"
                    required
                    onChange={() => setStagedAsset(null)}
                  />
                </label>
                <label>
                  License
                  <input
                    name="licenseLabel"
                    required
                    maxLength={200}
                    onChange={() => setStagedAsset(null)}
                  />
                </label>
                <label>
                  Source attribution
                  <input
                    name="sourceAttribution"
                    required
                    maxLength={1000}
                    onChange={() => setStagedAsset(null)}
                  />
                </label>
              </>
            )}
            {["bpm", "camelotKey", "energy", "valence"].map((field) => (
              <label key={field}>
                {field}
                <input
                  name={field}
                  defaultValue={
                    replacing ? "" : (editing.acoustic?.[field] ?? "")
                  }
                  key={`${editing.trackId}-${field}`}
                  required
                />
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={busy}>
            {busy
              ? "Saving…"
              : replacing
                ? "Save replacement"
                : "Save acoustic profile"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
