# Improvements and Enhancements

Created: 28 October 2026  
Status: Proposed roadmap for discussion and future implementation.

This document collects improvements beyond the current implementation. Creating it does not approve new features, define a confirmed Phase 7, or mark existing release gates complete. The [project requirements](PROJECT_REQUIREMENTS.md), [decisions](DECISIONS.md), [ordered backlog](TASKS.md) and [implementation status](IMPLEMENTATION_STATUS.md) remain authoritative.

## Current foundation

The application already includes accounts and lounge roles, synchronized playback and queues, voting, grounded AI proposals/Q&A, chat with sentiment/typing/reactions, Soundclash, recommendations, listening history, analytics and administrator tools. The Tidal Glass frontend redesign adds mobile sections and a persistent mini-player. Improvements below should extend these capabilities while preserving their behavior.

## Recommended next scope: listening experience and explainability

**Proposed Phase 7 title:** Listening Experience and Explainability.

This is a suggested scope, not an existing approved phase. Start with searchable track selection and compatibility explanations, then onboarding, recap presentation and accessibility. Keep recommendation-learning changes and advanced AI experiments in separate follow-up work.

| ID | Proposed improvement | Priority within this roadmap | Dependencies |
| --- | --- | --- | --- |
| IMP-001 | Searchable track selection | High | Existing catalog and queue/battle APIs |
| IMP-002 | Clear compatibility feedback | High | Server-owned BPM/Camelot eligibility |
| IMP-003 | First-session onboarding | High | Existing account/create/join/playback flows |
| IMP-004 | Better playback and error states | High | Existing authenticated player and connection state |
| IMP-005 | Accessible listening controls | High | Current responsive UI and browser tests |
| IMP-006 | Polished session recaps | Medium | Existing durable session summaries |
| IMP-007 | Library preparation tools | Medium | Admin catalog/profile APIs and provenance records |
| IMP-008 | Recommendation explanations and feedback | Medium | Existing recommender; contract/data decision for new feedback |

These priorities rank optional enhancements; they do not replace the P0/P1 priorities in the official backlog.

### IMP-001: Searchable track selection

Replace long track dropdowns with a shared picker for starting tracks, queue additions and Soundclash submissions.

- Search by title and artist; show duration and known BPM/key values.
- Distinguish playable assets, metadata-only fixtures and profiles needing preparation.
- Provide empty-search and loading/error states; retain the selection when recovering from an error.
- Start with existing catalog fields. Broader catalog pagination or search requires an explicit API extension if the currently loaded catalog is insufficient.

Acceptance checks:

- [ ] A keyboard and touch user can find and select a track without scrolling a long dropdown.
- [ ] Missing metadata is labelled honestly; no guessed acoustic values appear.
- [ ] Queue additions and battle submissions retain existing authorization and validation.
- [ ] Searching does not hide whether only part of the catalog has loaded.

### IMP-002: Clear compatibility feedback

Explain why a track is eligible for an immediate segue or must wait. Suggested messages include “Tempo outside this room's limit,” “Key is incompatible,” and “Acoustic profile needed.” A queued track and an eligible immediate next track are different states.

- Use the deterministic server eligibility result and current profile versions as the source of truth.
- Show known tempo/key facts and a concise explanation near selection or reservation controls.
- Keep current vote order and reserved-next behavior; explanations must not introduce a new queue algorithm.
- If new eligibility data is required, document a bounded read-only API/snapshot addition before implementation.

Acceptance checks:

- [ ] Reasons agree with identical/adjacent/relative Camelot rules and permitted tempo matching, including half/double time.
- [ ] Stale profiles or revisions trigger revalidation rather than a misleading promise.
- [ ] Every immediate segue still passes server-side checks; neither a manual action nor a model can bypass them.
- [ ] Concurrency, replay and permission tests remain green.

### IMP-003: First-session onboarding

Provide a short, dismissible checklist for Hosts: select a starting track, create the lounge, invite someone, enable audio on the device and start playback. Give Listeners a shorter join/listen/vote introduction.

Acceptance checks:

- [ ] Steps reflect actual account, role and room state.
- [ ] A user can skip or reopen guidance without blocking normal controls.
- [ ] Browser audio permission and missing playable media are explained with a next action.
- [ ] The flow works on mobile and with a keyboard; it does not claim that metadata fixtures are playable.

### IMP-004: Better playback and error states

Distinguish audio not enabled, file loading, browser playback blocked, asset unavailable, room paused, Host disconnected and session ended. Offer a specific recovery action for each recoverable state.

Acceptance checks:

- [ ] Loading and failures are visible in both full-player and mobile-player experiences where relevant.
- [ ] Retrying cleans up prior requests/object URLs and preserves authenticated media containment.
- [ ] There remains one audio element and the server remains the playback-clock authority.
- [ ] Reconnect and track changes do not create duplicate playback or discard a chat draft.

### IMP-005: Accessible listening controls

Extend current focus/contrast checks with screen-reader review and keyboard navigation across the complete journey. Consider documented, optional playback shortcuts with safeguards against triggering while typing.

Acceptance checks:

- [ ] Play/Pause, audio enable, voting, track selection, citations and room management have clear accessible names and states.
- [ ] Shortcuts respect roles, avoid editable fields and do not override native browser behavior unexpectedly.
- [ ] Mobile overlays do not obscure focused controls; reduced-motion and reduced-transparency fallbacks remain usable.
- [ ] Report actual assistive-technology/browser coverage and remaining gaps; do not infer WCAG certification from a computed-color audit.

### IMP-006: Polished session recaps

Present the existing summary as an easy-to-read session story: duration, peak participants, ordered track history, battle outcomes and sentiment timeline. Add crowd-favourite or like-based highlights only when the persisted data supports the definition.

Acceptance checks:

- [ ] Every displayed count and timeline reconciles with canonical persisted events or documented projections.
- [ ] Incomplete summaries remain clearly pending; missing data is not displayed as a measured zero.
- [ ] Recaps preserve existing access rules and do not expose private chat or another user's listening history.
- [ ] Any additional aggregate has a documented formula, bounded computation and tests.

### IMP-007: Library preparation tools

Help administrators identify incomplete acoustic profiles, inspect provenance and validate authorized tracks that could form a compatible demo chain.

Acceptance checks:

- [ ] Missing BPM/key/energy/valence values remain missing until authored or measured.
- [ ] Provenance is visible; an audio file's presence does not imply verified reuse rights.
- [ ] Profile edits retain version checks and server validation, including HTTP/socket authorization where applicable.
- [ ] Candidate-chain previews cannot change queues or force incompatible playback.

### IMP-008: Recommendation explanations and feedback

Make existing recommendation reasons easier to understand. As a separate extension, consider “Not interested” feedback to reduce repeated unsuitable suggestions.

Acceptance checks:

- [ ] Reasons reflect actual acoustic/collaborative inputs and distinguish catalog/cold-start fallbacks.
- [ ] Before collecting dismissal feedback, define its meaning, retention, privacy, API and training effect.
- [ ] Any persisted feedback is identity-bound and idempotent, with a compatibility/migration review if storage changes.
- [ ] Evaluate model changes on a chronological held-out dataset with coverage and fallback rates. Synthetic improvements alone do not establish recommendation quality.

## Existing release work to finish separately

These are already-open acceptance gates, not new optional features. Consult the implementation status for current evidence and qualifications.

| Gate | Remaining work | Completion evidence |
| --- | --- | --- |
| Authorized playable demo | Prepare at least three original/authorized playable tracks forming a verified compatible chain, with authored metadata and provenance | Rights/provenance records plus a real playback-chain demonstration |
| Real-model grounding and latency | Evaluate the existing local adapter on declared hardware and supported/unsupported questions; report cold/warm behavior and fallback rate | Audited sources/answers and actual outro-to-render latency measurements |
| Independent sentiment evaluation | Use an independently authored, held-out labelled dataset | Dataset version/hash, confusion matrix and measured accuracy against the existing target |
| Normal-use recommendations | Collect suitable interactions and evaluate chronological held-out recommendations | Precision@5 against the existing target, coverage and documented relevance/split protocol |
| Queue latency acceptance | Investigate the recorded maximum-latency miss and rerun the declared workload under controlled conditions | Raw samples, hardware/workload details, failures and max/P95 results |
| Deployment and accessibility | Verify the intended private deployment/TLS configuration and broaden accessibility review | Deployment smoke checks, recovery evidence and documented browser/assistive-technology coverage |

Do not mark these complete based on the new theme, mock providers, metadata fixtures or synthetic silence.

## Conditional later experiments

These ideas need a demonstrated limitation, a documented scope decision and an evaluation plan before implementation.

| Experiment | When it is justified | Boundaries |
| --- | --- | --- |
| Automatic BPM/key analysis | Manual acoustic-profile preparation becomes a measured bottleneck | Authorized local audio only; review licensing/runtime assumptions; retain uncertainty, provenance and administrator review |
| Embedding-based retrieval | The existing lexical retriever demonstrably misses relevant authored facts | Benchmark against the lexical baseline; retain versioned citations, unsupported-answer refusal and injection checks |
| Multilingual sentiment | A defined audience needs additional languages | Independently labelled language-specific data, explicit uncertainty/fallback behavior and separate measured results |
| Paged analytics projections | Long sessions expose the documented full-log summary aggregation limit | Preserve exact reconciliation and end-session flush semantics; review indexes and migration compatibility |

## Implementation rules

- Preserve React/Node/Express/Socket.IO/MongoDB in JavaScript, one application instance, one database pool and serialized room authority.
- Preserve all three PRD epics, authentication, server-owned identity/roles/votes/clock and deterministic compatibility checks.
- Keep existing API examples/socket names compatible; document justified additions and update requirements, decisions, architecture, schema, APIs, tasks and tests together when behavior changes.
- Keep buffers, searches, background jobs and analytics bounded. Do not claim exactly-once delivery or zero-loss crash recovery.
- Keep real Spotify infrastructure/catalog/user data, DSP/crossfade, synthesized speech/music and public streaming outside this roadmap.
- Preserve the Tidal Glass design system unless a later user instruction changes it.
- Reverify official third-party capabilities before adopting dependencies; benchmark only on declared hardware/data.
- Test changed behavior according to [the testing strategy](TESTING_STRATEGY.md). Queue changes require concurrency/replay checks; permission changes require HTTP/socket RBAC checks. Database migrations require backup/restore and compatibility review.
- Record actual results and unresolved limitations. No feature in this file is implemented or accepted merely because it is listed.

## Suggested implementation order

1. Confirm the next enhancement scope and record it in the official backlog.
2. Deliver IMP-001 and IMP-002 together so track discovery and compatibility feedback agree.
3. Add IMP-003 and IMP-004 using real account/room/player states.
4. Apply IMP-005 throughout the work, then complete the broader accessibility review.
5. Improve IMP-006 using existing summaries; introduce additional aggregates only with defined data semantics.
6. Evaluate IMP-007 and IMP-008 as subsequent slices; complete relevant release gates in parallel where their data and environment dependencies permit.

No calendar dates, effort estimates or new acceptance thresholds are committed by this proposed ordering.

## Implementation started — 28 October 2026

The user authorized starting this roadmap. IMP-001 has a first loaded-catalog search slice in all three forms. Full-catalog pagination/loading/retry and IMP-002–008 remain pending. This does not close release gates. [Implementation details](TRACK_SELECTION_ENHANCEMENT.md).

## Listening-flow priorities — 28 October 2026

Record of the seven UI/UX improvements discussed with the user. These are planned work unless an implementation is explicitly linked; listing them does not mark them complete.

| Order | Improvement | Planned behavior | Current status |
| --- | --- | --- | --- |
| 1 | Compatibility feedback (IMP-002) | Server-validated “Eligible next,” “Tempo outside limit,” “Key incompatible,” or “Profile needed” beside tracks. Clearly distinguish adding to the queue from reserving immediate next. | Pending |
| 2 | Full-library search (IMP-001) | Search beyond the first 100 tracks through bounded paginated requests. Results show title, artist, duration, known BPM/key and audio availability, with loading, retry and empty states. | Loaded-page picker implemented; full-library search pending |
| 3 | Playback recovery (IMP-004) | Distinguish enable-audio, loading, browser-blocked playback, unavailable asset, paused room, Host disconnection and session end. Provide specific recovery actions consistently in the full and mobile players. | Enhanced recovery flow pending |
| 4 | Stale-action recovery (IMP-009) | Preserve selections/drafts on stale-revision rejection, resync to authoritative state, explain what changed and offer a fresh action. Never blindly replay a mutation against a new revision or bypass server validation. | Pending; intermittent stale-revision playback rejection documented |
| 5 | Lightweight onboarding (IMP-003) | Dismissible/reopenable Host checklist: choose track, create lounge, invite someone, enable audio, play. Shorter Listener introduction: listen, vote and chat. Steps reflect actual role/state. | Pending |
| 6 | Queue readability (IMP-010) | Make reserved-next position clear, explain vote ordering and show the server-derived reason a Soundclash winner was deferred. Preserve existing ordering and compatibility rules. | Existing basic reservation/deferred labels; richer explanation pending |
| 7 | Useful recaps (IMP-006) | Present persisted duration, peak participants, ordered track history and supported battle results as a readable recap. Unknown/pending data stays explicit; additional aggregates require defined semantics. | Existing analytics available; recap presentation enhancement pending |

Next implementation priority: compatibility feedback, full-library search and playback recovery. This updates the suggested order above; stale-action recovery follows closely because it affects playback reliability.

Separately, automatic natural-end continuation is implemented: the server starts the reserved entry or queue head after current-profile/audio validation. Empty or blocked queues pause. This is not completion of the broader recovery/compatibility UI. [Automatic continuation and actual validation](AUTOMATIC_QUEUE_CONTINUATION.md).

## Listening-flow implementation update — 28 October 2026

An incremental slice now implements the seven listening-flow priorities above: server compatibility explanations (IMP-002), full-library paginated picker/search (IMP-001), shared full/mobile device recovery states (IMP-004), preserved-selection resync guidance (IMP-009), dismissible/reopenable role-aware guidance (IMP-003), reserved-next priority explanation (IMP-010), and persisted session recap presentation with capped canonical battle results (IMP-006).

This supersedes the earlier “pending” presentation statuses for this slice only. Broader screen-reader/cross-browser review, real-data/model/licensing/latency/deployment gates, library preparation and recommendation feedback work remain open. [Exact scope, API/storage compatibility and validation](LISTENING_FLOW_IMPROVEMENTS.md).
