import React from "react";

const paths = {
  play: "m9 5 11 7-11 7V5Z",
  pause: "M8 5v14M16 5v14",
  next: "m5 5 10 7-10 7V5ZM19 5v14",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  volume: "m11 5-6 4H2v6h3l6 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  disc: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  queue: "M4 5h16M4 11h12M4 17h8m6-3 4 3-4 3",
  chat: "M21 11a8 8 0 0 1-8 8H7l-5 3V11a9 9 0 0 1 19 0ZM7 10h10M7 14h6",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  clash: "m4 4 7 7m2 2 7 7M4 20l7-7m2-2 7-7M3 3l5 1-4 4-1-5Zm18 0-1 5-4-4 5-1Z",
  room: "M12 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM5 21v-5a7 7 0 0 1 14 0v5M2 10a3 3 0 0 1 3 3M22 10a3 3 0 0 0-3 3",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 19 19 5M5 5h14v14",
};

export function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.disc} />
    </svg>
  );
}

// Original CSS geometry, never presented as album artwork or an audio visualizer.
export function TrackArt({ seed = "studio", small = false }) {
  const hue =
    [...seed].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 75;
  return (
    <div
      className={`track-art${small ? " track-art-small" : ""}`}
      style={{ "--art-shift": `${hue}deg` }}
      aria-hidden="true"
    >
      <div className="glass-disc">
        <div className="disc-core" />
      </div>
      <span className="art-orbit" />
    </div>
  );
}
