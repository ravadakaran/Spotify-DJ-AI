# Listening-flow improvements — 28 October 2026

Authorized incremental implementation of the listening-flow roadmap, preserving Tidal Glass, existing catalog management and automatic queue continuation.

Implemented additive read-only contract: `GET /api/v1/lounges/:id/compatibility?trackIds=<comma-separated UUIDs>` accepts 1–200 distinct IDs. Authenticated current room membership is required; the server reads current profiles inside the room FIFO and returns epoch/revision, current track/profile version, tolerance and per-track facts, profile version, eligibility and reasons. This report does not reserve/reorder/play a track. Mutations retain their existing role and final revalidation checks. No schema/index/migration or socket-name change.

`GET /tracks?q=...&limit=...&cursor=...` expands existing literal case-insensitive title search to title OR artist, composed with cursor pagination. Page size remains bounded at 100. The picker uses server search with debouncing, pagination, loading/retry/no-match states and a retained selection; results are capped per displayed page rather than accumulating the catalog in memory.

Player recovery states and stale-action guidance remain client presentation around existing server authority. No automatic retry of rejected mutations. Implementation and validation are recorded below.

## Implemented behavior

- Compatibility labels beside selected/queued tracks use the server predicate for identical/adjacent/relative Camelot and half/double-time BPM. Missing profiles/audio and deleted tracks remain explicit. The read-only report is a last check, with epoch/revision and profile versions; it is not a promise of later eligibility. The client refreshes when selected IDs, current track/profile, tolerance or epoch change, every 30 seconds while mounted, or on explicit retry. Stable sorted ID sets prevent vote reorder from issuing more checks. All existing manual/AI/battle/automatic immediate segues still revalidate.
- Compatibility reads have a separate authenticated-identity quota of 30/minute. Existing authentication and the 120/minute general catalog/command quota remain; passive checks do not consume that command budget. Invalid/unauthorized compatibility requests also count toward the read quota.
- Full-library literal title/artist search is debounced by 250 ms. Next-page/back-to-first navigation retains at most one 100-result page plus the selected track. A selected result remains present across filters, pagination and errors. Known artist, duration, BPM/key and asset availability appear in native options and the selected facts. Search has visible loading/no-match/error/retry states. A local asset reference is not proof of reuse rights or a successful future fetch.
- Full/mobile players share device audio state and recovery actions: enable audio, loading, unavailable/undecodable audio, browser playback blocked, room pause, connection loss, Host freeze, persistence degradation and session end. Retry aborts prior fetches and revokes old object URLs through the existing cleanup; one audio element remains mounted. A blocked browser play waits for explicit device enable instead of retrying on every clock sync. Server clock/permissions and automatic track-end continuation remain authoritative.
- Stale revision/proposal/generation errors preserve selections/drafts and request a coherent socket resync. The user reviews the current state and submits a fresh action; rejected mutations are never blindly replayed. Network failures still use the existing explicit error path.
- A dismissible/reopenable guide covers starting a lounge and role-aware Host/Listener room steps, based on membership, actual playback and device enable state. Dismissal lasts for the mounted view; it is not a new profile/retention setting.
- A reserved-next notice explains priority over vote position. Queue voting/order is unchanged. Existing Soundclash announcement reasons remain visible for deferred winners; current compatibility labels show the latest checked reason.
- Session recap shows persisted duration (including pauses), peak listeners, battles opened, questions, ordered playback starts, resolved battle results and sentiment samples. Loading, pending, errors/retry and missing older data are distinct. Scrollable detail avoids an unbounded-height page.

## Additive summary contract and compatibility

Newly generated `SessionSummary.summary` documents add `resolvedBattleCount`, `battleOutcomes` and `battleOutcomesTruncated`. The analytics HTTP response includes the same optional fields. Outcomes derive only from canonical `battle.resolved` events: time, winning track ID/title/artist, application status and persisted announcement reason. Total resolved count covers all such events; only the last 100 result details are retained in chronological order. Cancelled or tied-but-unresolved battles are not counted as resolved. Existing battleCount still counts battle opens.

The summary storage is already Mixed; no validator/index/migration changes are needed. Existing saved summaries remain readable and show unavailable outcome detail instead of invented zeroes. No historical backfill, private migration or database write outside disposable tests is performed. Normal backup/restore compatibility is unchanged; older code ignores the additive summary fields. The existing full-event-log session-end aggregation limitation remains; this UI work does not solve long-session projection scaling. No new private chat or user history is included, and analytics membership access is unchanged.

## Verification record

The first browser pass exposed excessive compatibility reads caused by changing queue order; it hit the general request limit. Sorted ID sets, bounded refresh triggers and a separate read quota address this without weakening the command quota. An intermediate device-block recovery test exposed repeated background play attempts; the player now waits for explicit Enable audio after browser rejection.

Final commands/results are recorded below. No real-model, music-quality, live-deployment, screen-reader or new latency acceptance is inferred from these tests.

## Actual final validation

Windows / existing Node v24.13.0 workspace; disposable real MongoDB replica sets, authored metadata and generated test silence only.

| Command/check | Actual result |
| --- | --- |
| `npm run lint` | Passed after final source changes |
| `npm run build` | Passed after final source changes |
| `npm test` | 60 tests / 13 suites passed in 47.907 seconds; includes catalog management, queue concurrency, crash/replay and HTTP/socket authorization |
| `npm run test:e2e` | All four Chromium scenarios passed in 1.7 minutes: catalog management (5.1 s), two-context lounge journey (1.1 min), automatic continuation (9.0 s), new discovery/stale-action/device recovery journey (10.2 s) |
| Rendered accessibility | Existing six-view solid-color contrast/control-name/focusability audit passed with zero failures; 320/390/760/768/1024px journey overflow checks passed |
| Visual review | Final desktop lounge, persisted recap and mobile recovery/queue screenshots inspected |
| Design detector | No findings on the new/changed UI components |
| `git diff --check` | Passed |

The new browser journey verifies 105 artist-matched results across two nonoverlapping pages, error retry with preserved selection, a synthetic rejected stale mutation without queue change, explicit fresh submission, guide dismissal/reopen, synthetic media outage/retry, shared mini-player status, simulated browser blocking/explicit enable, exactly one audio element and object-URL cleanup on logout. Rejected/failed synthetic responses are deliberate test injections, not evidence of live service failures.

Additional intermediate findings: logout after registration retained the signup view; successful logout now resets it to sign-in. A new pagination assertion initially assumed UUID/timestamp-tied fixture rows were insertion-ordered; it now asserts the actual cursor contract (100+5 distinct rows, no duplicates). The expanded two-context journey has a 120-second test budget; per-action assertions and product latency targets are unchanged. These browser durations are not latency benchmarks.

Evidence: [desktop lounge](../evidence/listening-flow-lounge.png), [mobile](../evidence/listening-flow-mobile.png), [recap](../evidence/listening-flow-analytics.png), [picker](../evidence/listening-flow-track-picker.png), [accessibility audit](../evidence/listening-flow-accessibility.json). The final foundation run writes a separate listening-flow prefix. The full suite's generated restore report was replaced with the exact pre-turn workspace copy; SHA-256 equality was checked, preserving its existing uncommitted state.

No running private app was stopped/restarted, no private database migrated/backfilled, no asset/library changed, no new dependency installed and no deployment performed. Servers without source watching need a restart to load the new read route. Broader screen-reader/cross-browser work, independent AI/data evaluations, verified legal playable chains, deployment and outstanding latency gates remain open. The recap's existing full-log aggregation capacity limit is unchanged. Passing tests reduce regression risk; they are not a guarantee of every browser or workload.
