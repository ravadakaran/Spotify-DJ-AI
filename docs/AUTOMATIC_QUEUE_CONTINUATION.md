# Automatic queue continuation — 28 October 2026

User-requested behavior change: at the authoritative end of a playing track, start the reserved entry (if present), otherwise the first ordered Next Up entry, without requiring Skip / Advance. This supersedes the earlier end-pause default in ADR-013 and Phase 2/3 notes. It does not automatically approve AI proposals: pending generated choices do not reserve or reorder the queue. Manual Skip / Advance and explicit AI approval remain available.

The existing 200 ms server tick performs the transition inside the same per-room FIFO as commands and votes. It re-reads current profiles, requires ready profiles and deterministic BPM/Camelot eligibility, and requires a local audio asset reference. A blocked reservation/head is retained and playback pauses; entries are never silently skipped. Empty queues pause. Paused, frozen, ended and persistence-unhealthy rooms do not automatically start another track. Clients follow the existing coherent playback snapshot; no browser-ended mutation, duplicate audio element or new timer is added.

Automatic starts reuse the existing playback.start event/reducer/batch writer, with a fresh playback ID, null internal actor and no client command receipt. Queue removal, reservation clearing, listening meters, history and replay use the same reducer as manual starts. No schema/index/migration, dependency, API request or socket-name change is required. Recovery still pauses on a new epoch. This is sequential file playback, with existing media-loading delay and server tick resolution; no gapless playback or crossfade claim is made.

Verification adds concurrent end ticks (one queue consumption/start), empty-queue pause, durable automatic-start event count, restart with the advanced track paused, changed acoustic profile rejection, missing audio, explicit pause, Host freeze and reservation precedence. Existing concurrency/replay/RBAC suites must also pass. Browser fixtures remain generated silence and metadata; legal-media/model gates remain open.

Actual validation (Windows, Node v24.13.0):

- `npm run lint` and `npm run build`: passed.
- `npm test`: 50 tests across 11 suites passed, including concurrency/replay and HTTP/socket RBAC.
- After the final recovery guard/profile-read refinement, `npm test -- --testPathPatterns=phase-three.integration`: all four tests passed again; lint passed again.
- Existing two-context `npm run test:e2e` journey: passed (50.6 seconds / 58.2 seconds overall).
- Added targeted browser `npm run test:e2e -- --grep "natural track completion"`: passed (3.2 seconds / 10.8 seconds overall). It advances the authoritative clock past the test track end, observes the queued title and empty queue, and verifies the single authenticated audio element is playing, without issuing Advance.
- `git diff --check`: passed. Historical disposable restore evidence was restored after the full suite.

No running private app was stopped or restarted, and no private database was migrated. A server process without source watching needs a restart to load this implementation. Tracks with pending acoustic profiles remain ineligible for immediate continuation; this change does not invent their BPM/key values or remove compatibility safeguards.
