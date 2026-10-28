# Tidal Glass

28 October 2026. Implements the user's requested replacement theme. Mode: Operate. The listening experience leads; room administration is secondary.

## Visual system

Midnight navy ground (#080e1b), pale blue-white foreground (#f2f6ff), cyan accent (#91e7eb), blue secondary text (#adbbd3). Translucent blue glass panels use restrained backdrop blur, an inset top reflection and soft offset shadows. Opaque controls protect text contrast. Locally available Segoe UI Variable/Segoe UI supplies UI typography; Georgia supplies the welcome-page italic accent. No remote fonts or assets.

Original CSS refractive-disc geometry is a decorative track placeholder, never album art, audio analysis or a waveform. SVG controls share an authored 24px/1.6px stroke system. Native progress/meter semantics remain. Interactions use short state transitions; welcome disc has one entrance. Reduced-motion and reduced-transparency preferences receive explicit fallbacks; browsers without backdrop blur receive solid surfaces.

## Layout and interaction

Desktop: fixed inset sidebar; compact lounge heading/invite; section navigation; Now Playing beside Next Up; expandable room management; grounded AI Q&A/proposals; chat and Soundclash. Playback controls live with the track. Play/Pause is stateful, Like reports Liked with aria-pressed, and destructive session-end control lives in room management.

At 760px and below: five bottom section buttons select Queue, Chat, AI DJ, Soundclash or Room. Sections remain mounted to preserve drafts, history and player state. The full player appears in Queue; its single audio element remains mounted and playback continues in other sections. A fixed compact current-track bar returns to the full player and gives authorized DJs Play/Pause. Safe-area-aware padding leaves space for both fixed bars. Overview remains reachable at the top on mobile.

## Integrity and accessibility

Keyboard focus, 44px primary touch targets, native details/summary, named icons, stable chat-field label, readable helper text, wrapping track names and numeric progress. Connection/freeze/recovery alerts stay outside section hiding. Diagnostics and citation IDs are expandable; template mode remains explicit. Role visibility is convenience only: unchanged server validation remains authoritative.

## Listening-flow additions

28 October 2026: keep native track selection with bounded server-search pages and visible retained-selection/loading/error states. Compatibility labels describe the last server check and expose profile/revision context; they never promise a future segue. Full/mobile audio status shares one mounted player and explicit recovery actions. The role-aware guide is dismissible/reopenable. Recaps use definition-labelled totals and scrollable canonical detail, with missing older data explicit. The reserved-next notice explains priority without changing queue order.
