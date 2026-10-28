import React, { useEffect, useId, useRef, useState } from "react";
import TrackCompatibility from "./Compatibility.jsx";

const facts = (track) =>
  `${track.artist || "Artist unknown"} · ${Number.isFinite(track.durationSeconds) ? `${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, "0")}` : "Duration unknown"} · ${track.assetId ? "Local audio asset" : "Metadata only; no audio"} · ${track.acoustic ? `${track.acoustic.bpm} BPM · ${track.acoustic.camelotKey}` : "Acoustic profile needed"}`;

// Native selection retains keyboard/touch semantics and required form validation.
export default function TrackPicker({
  tracks,
  api,
  room,
  name = "trackId",
  label,
  starting = false,
}) {
  const id = useId(),
    apiRef = useRef(api);
  apiRef.current = api;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(starting ? null : tracks[0] || null);
  const [page, setPage] = useState({ items: tracks, nextCursor: null });
  const [cursor, setCursor] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: "100", q: query.trim() });
      if (cursor) params.set("cursor", cursor);
      apiRef
        .current(`/tracks?${params}`)
        .then((result) => {
          if (!active) return;
          setPage(result);
          setSelected(
            (previous) =>
              result.items.find(
                (track) => track.trackId === previous?.trackId,
              ) || previous,
          );
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, cursor, attempt, tracks]);
  const matching = page.items.filter((track) =>
    `${track.title} ${track.artist || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const retained =
    selected && !matching.some((track) => track.trackId === selected.trackId);
  const options = retained ? [selected, ...matching] : matching;
  return (
    <div className="track-picker" aria-busy={loading}>
      <label htmlFor={`${id}-search`}>Search {label.toLowerCase()}</label>
      <input
        id={`${id}-search`}
        type="search"
        maxLength={100}
        value={query}
        placeholder="Title or artist"
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(null);
        }}
      />
      <label htmlFor={`${id}-select`}>{label}</label>
      <select
        id={`${id}-select`}
        name={name}
        required
        value={selected?.trackId || ""}
        aria-describedby={`${id}-results ${id}-facts`}
        onChange={(event) =>
          setSelected(
            options.find((track) => track.trackId === event.target.value) ||
              null,
          )
        }
      >
        <option disabled value="">
          Choose from your catalog
        </option>
        {options.map((track) => (
          <option key={track.trackId} value={track.trackId}>
            {track.title} — {facts(track)}
          </option>
        ))}
      </select>
      <small id={`${id}-results`} role="status">
        {loading
          ? "Searching library…"
          : error
            ? "Library search unavailable. Your selection is retained."
            : matching.length
              ? `${matching.length} matching tracks on this page.`
              : "No matches. Try another title or artist."}
        {retained ? " Current selection retained." : ""}
        {!loading && !error
          ? page.nextCursor
            ? " More results available."
            : " End of results."
          : ""}{" "}
        Search covers the full library; up to 100 results per page.
      </small>
      <div className="control-row">
        {error && (
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry library search
          </button>
        )}
        {page.nextCursor && !error && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setCursor(page.nextCursor)}
          >
            Next 100 results
          </button>
        )}
        {cursor && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setCursor(null)}
          >
            Back to first results
          </button>
        )}
      </div>
      <small id={`${id}-facts`}>
        {selected
          ? `${selected.title} · ${facts(selected)}`
          : "Select a track to inspect its audio and acoustic metadata."}
      </small>
      {room && selected && (
        <TrackCompatibility api={api} room={room} trackId={selected.trackId} />
      )}
    </div>
  );
}
