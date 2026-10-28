import React, { useState } from "react";
export default function FirstSteps({
  room,
  host = false,
  audioEnabled = false,
}) {
  const [visible, setVisible] = useState(true);
  if (!visible)
    return (
      <button
        className="text-button"
        type="button"
        onClick={() => setVisible(true)}
      >
        Show listening guide
      </button>
    );
  const steps = !room
    ? [
        "Choose a starting track with local audio.",
        "Create your lounge, then copy its invite code.",
        "Enable audio on each device and press Play.",
      ]
    : room.status === "ended"
      ? [
          "This session has ended. Open Session analytics for your recap.",
          "Return to Overview to create or join another lounge.",
        ]
      : host
        ? [
            "Lounge created. Share the invite code above.",
            room.members.length > 1
              ? "Someone joined your lounge."
              : "Invite someone to join your lounge.",
            audioEnabled
              ? "Audio is enabled on this device."
              : "Enable audio on this device.",
            room.nowPlaying
              ? "Playback has started. Add tracks to Next Up for automatic continuation."
              : "Press Play to start the selected track.",
          ]
        : [
            "You have joined the lounge.",
            audioEnabled
              ? "Audio is enabled on this device."
              : "Enable audio on this device; the Host controls playback.",
            "Vote in Next Up, join Soundclash or say hello in Chat.",
          ];
  return (
    <details className="listening-guide">
      <summary>{room ? "Listening guide" : "Your first lounge"}</summary>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        className="text-button"
        onClick={() => setVisible(false)}
      >
        Dismiss guide
      </button>
    </details>
  );
}
