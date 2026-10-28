# Phase-by-Phase Implementation To-Do List

> **Project:** Spotify AI DJ Studio (Collaborative Live Queue & Sentiment-Aware Audio Engine)  
> **Status:** Foundation implementation underway; [verified progress and open gates](IMPLEMENTATION_STATUS.md)  
> **Rule:** Work in strict phase and dependency order. Complete phase exit gates before advancing.

Implementation note (18 October 2026): the user's request to start was applied to independent foundation work while legal-media/model gates remain explicitly open. Checked sub-items below represent implemented behavior, not completion of a full phase or approval of every provisional decision.

---

## Phase 0: Scope, Legal Data & Feasibility Gate

**Objective:** Lock architecture decisions, confirm asset provenance, benchmark hardware/model constraints, and agree on error/loss budgets before writing application code.

### [ ] TASK-001: Confirm Track, Stack & Scope Baseline
- [ ] Confirm PRD Track A (Full-Stack) and Option B baseline: React, Vite, Tailwind CSS, Node.js, Express, Socket.IO, MongoDB/Mongoose in plain JavaScript ([ADR-001](DECISIONS.md#L7), [REQ-002](PROJECT_REQUIREMENTS.md#L14)).
- [ ] Formally document exclusion of real Spotify accounts, APIs, Web SDK, audio catalog, and proprietary ingestion ([REQ-001](PROJECT_REQUIREMENTS.md#L13)).
- [ ] Review and sign off on [ADR-001 through ADR-014](DECISIONS.md).
- [ ] Resolve Open Question `OQ-01` (Track selection sign-off).
- [ ] Resolve Open Question `OQ-02` (Clarify internship schedule as relative checkpoints, not fixed calendar commitments).

### [ ] TASK-002: Legal Media & Evaluation Dataset Planning
- [ ] Source $\ge 3$ original or CC-licensed local audio files forming a legally verified, compatible segue chain $A \to B \to C$ ([REQ-010](PROJECT_REQUIREMENTS.md#L22)).
- [ ] Author acoustic profiles (BPM, 24 Camelot key, energy, valence in $[0,1]$) and immutable timeline events (trivia/glossary) for the seed tracks ([REQ-010](PROJECT_REQUIREMENTS.md#L22)).
- [ ] Plan expanded offline evaluation catalog ($\ge 20$ tracks) and synthetic/manual interaction set ($\ge 10$ users) to support Precision@5 metric validation ([REQ-015](PROJECT_REQUIREMENTS.md#L27)).
- [ ] Establish `data/assets/` directory layout with license and provenance manifest.

### [ ] TASK-003: Model, Hardware & Runtime Feasibility Gate
- [ ] Select and benchmark LLM runtime: Local Ollama on loopback port `11434` as the recommended baseline; or an evaluated hosted provider assessed for data containment, no-training policy, and latency SLA ([ADR-007](DECISIONS.md#L13), [OQ-03](PROJECT_REQUIREMENTS.md#L68)).
- [ ] Benchmark model candidates on deployment hardware for JSON output schema and response latency target (cold vs. warm, budget $<2.3\text{ s}$) ([REQ-019](PROJECT_REQUIREMENTS.md#L31)).
- [ ] Resolve `OQ-03`: Document target OS, Node LTS version, RAM, and GPU/CPU constraints.
- [ ] Resolve `OQ-04`: Formalize bounded crash-loss budget ($\le 1\text{ s}$ / 50 events in buffer).
- [ ] Resolve `OQ-05`: Formalize Host-loss behavior (immediate playback freeze; tie awaits manual resolution).
- [ ] Resolve `OQ-06`: Confirm vote rules (1 upvote/user/queue entry, 1 changeable battle vote, hard acoustic eligibility overrides crowd winner for immediate segue).

**Phase 0 Exit Gate:** Signed-off decisions, verified legal audio files with authored metadata, confirmed LLM execution within latency bounds (Ollama loopback baseline or evaluated hosted provider), and agreed concurrency/loss semantics.

---

## Phase 1: Foundation & One Vertical Slice

**Objective:** Walking skeleton: Register $\to$ Login $\to$ Create Lounge $\to$ Join Lounge $\to$ Shared State Snapshot across two distinct browser sessions.

### [x] TASK-004: Workspace Scaffolding, Docker Compose & CI Baseline
- [x] Initialize npm workspaces: root `package.json`, `client/` (Vite + React), and `server/` (Node.js ES modules) ([REQ-002](PROJECT_REQUIREMENTS.md#L14)).
- [x] Pin Node LTS in `.node-version` and configure ESLint/Prettier with consistent rules.
- [x] Author `docker-compose.yml` defining MongoDB replica set `rs0` for multi-document ACID transactions ([ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md#L45)).
- [x] Provide `.env.example` with documented non-secret defaults.
- [x] Configure root test scripts: `npm test`, `npm run test:integration`, `npm run lint`.

### [x] TASK-005: Schema Migrations, Indexes & Deterministic Seed
- [x] Build migration runner with checksum validation and `schema_migrations` collection ledger ([DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#L61)).
- [x] Implement Mongoose models with validation: `users`, `refresh_sessions`, `tracks`, `audio_assets`, `lounges`, `memberships`.
- [x] Apply unique and compound indexes (normalized email, active invite code, acoustic BPM/key).
- [x] Author idempotent seeder `npm run db:seed` inserting three validated metadata fixtures with authored acoustic profiles. Playable verified demo audio remains the separate TASK-002 gate; imported songs have pending profiles.
- [x] Write CLI admin creation command: `npm run admin:create` ([TEST-002](TESTING_STRATEGY.md#L8)).

### [x] TASK-006: Authentication, Token Lifecycle & RBAC Engine
- [x] Implement password hashing with Argon2id and calibrated parameters ([SECURITY.md](SECURITY.md#L20)).
- [x] Build JWT issuance: 15-minute access token in memory, 7-day rotating refresh token in `HttpOnly`, `Secure`, `SameSite=Strict` cookie ([ADR-011](DECISIONS.md#L17)).
- [x] Implement token family replay detection and family-wide revocation ([SECURITY.md](SECURITY.md#L22)).
- [x] Implement 4-tier permission middleware: Listener, Co-DJ, Host, Admin with room-scoped isolation ([SECURITY.md](SECURITY.md#L7)).
- [x] Implement route-level and handshake rate limiting (login throttling, auth checks) ([TEST-001](TESTING_STRATEGY.md#L7)).

### [x] TASK-007: Catalog, Media Streaming & Acoustic Profile API
- [x] Build `POST /api/v1/assets` multipart upload for Admins with MIME/magic-byte checks and private root containment ([API_SPECIFICATION.md](API_SPECIFICATION.md#L29)).
- [x] Build `GET /api/v1/assets/:id/content` supporting authenticated HTTP 206 Partial Content Range streaming ([API_SPECIFICATION.md](API_SPECIFICATION.md#L30)).
- [x] Build `POST /api/v1/tracks` and `GET /api/v1/tracks` catalog search with cursor pagination.
- [x] Build `GET /api/v1/tracks/:id/acoustic-profile` and `PUT` versioned profile editor with `expectedProfileVersion` conflict protection ([API_SPECIFICATION.md](API_SPECIFICATION.md#L32)).

### [x] TASK-008: Lounge Management & Initial Console UI
- [x] Build `POST /api/v1/lounges` (Host lounge creation, invite hash generation, initial state) ([API_SPECIFICATION.md](API_SPECIFICATION.md#L72)).
- [x] Build `POST /api/v1/lounges/join` (idempotent invite join, capacity check $[2, 50]$ participants).
- [x] Implement minimal Socket.IO handshake authentication verifying JWT and lounge membership.
- [x] Build React client views: Registration, Login, Lounge Creation, Join by Code.
- [x] Render initial Lounge Console displaying authoritative `lounge.state.snapshot`.
- [x] Verify vertical slice across two independent browser sessions ([TEST-002](TESTING_STRATEGY.md#L8), [TEST-015](TESTING_STRATEGY.md#L21)).

**Phase 1 Exit Gate:** Two distinct users register, create a lounge, join via invite, and view an identical synchronized room snapshot. Invalid profiles and unauthenticated access are rejected.

---

## Phase 2: Authoritative Queue, Real-Time Sync & Persistence

**Objective:** Single-source-of-truth live queue with deterministic vote reordering, presence tracking, host-loss freezing, and bounded-batch crash recovery.

### [x] TASK-009: Per-Room Serialized Reducer & Concurrent Vote Authority
- [x] Implement per-room in-memory command FIFO serializer in `server/src/rooms/` ([ARCHITECTURE.md](ARCHITECTURE.md#L31)).
- [x] Author pure state reducer handling `queue.enqueue`, `queue.remove`, `queue.vote`, `queue.promote` ([ARCHITECTURE.md](ARCHITECTURE.md#L44)).
- [x] Enforce deterministic tie-breaking for Next Up: `voteCount DESC` $\to$ `enqueueSequence ASC` $\to$ `entryId ASC`.
- [x] Implement idempotent upvoting (1 vote per user per track entry; PUT toggles/deduplicates).
- [x] Build concurrency test simulating 100 concurrent votes from 10 users verifying zero state divergence ([TEST-003](TESTING_STRATEGY.md#L9)).

### [x] TASK-010: Bounded Event Buffer, Batch Writer & Crash Recovery
- [x] Implement in-memory bounded ring buffer flushing every 1 second or 50 events ([ARCHITECTURE.md](ARCHITECTURE.md#L75)).
- [x] Author transactional batch writer inserting into `queue_events` and updating `room_snapshots` watermark using MongoDB replica set transactions ([DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#L18)).
- [x] Implement write failure degradation: mark room degraded, pause mutations, cap buffer, set `/health/ready` to 503.
- [x] Implement crash recovery: replay events from durable snapshot watermark, issue new epoch, pause playback, and await Host resume ([TEST-010](TESTING_STRATEGY.md#L16)).

### [x] TASK-011: Socket.IO Gateway, Presence & Snapshot Catch-Up
- [x] Implement Socket.IO room lifecycle: join room on 1st tab, leave room after 10-second grace on 0 tabs ([ARCHITECTURE.md](ARCHITECTURE.md#L73)).
- [x] Implement unique-user presence counting (tabs do not multiply user presence).
- [x] Build snapshot catch-up protocol: clients buffering newer events until snapshot installed; resync on epoch change or sequence gap ([REQ-006](PROJECT_REQUIREMENTS.md#L18)).
- [x] Implement periodic RTT ping/pong (`lounge.sync.ping` / `pong`) estimating server clock offset for clients ([API_SPECIFICATION.md](API_SPECIFICATION.md#L122)).
- [x] Verify snapshot acquisition and render latency $<2\text{ s}$ on new join ([TEST-004](TESTING_STRATEGY.md#L10)).

### [x] TASK-012: Host Disconnect Freeze, Moderation & Authority Transfer
- [x] Detect last-host-socket disconnection and trigger immediate `mutationFrozen=true` ([ADR-009](DECISIONS.md#L15)).
- [x] Block queue advance and playback timers while frozen; preserve read availability. Battle/chat routes remain later phases and will use the same guard.
- [x] Implement `POST /api/v1/lounges/:id/host-transfer` (atomic Host reassignment, old Host demoted to Co-DJ) ([API_SPECIFICATION.md](API_SPECIFICATION.md#L41)).
- [x] Implement member moderation: persist mute state with a tested unmuted-member guard, and remove users from every room subscription. Chat/reaction route wiring remains Phase 4 ([REQ-008](PROJECT_REQUIREMENTS.md#L20)).

### [x] TASK-013: Web Audio Player, Monotonic Clock & Queue Console UI
- [x] Build React Now Playing console with elapsed time bar driven by server timestamps and monotonic duration.
- [x] Implement browser audio unlock button (handling autoplay restrictions gracefully).
- [x] Build interactive Next Up list with real-time upvote counters and position re-sort animations.
- [x] Display visual connection quality indicator and frozen-room overlay banner.
- [x] Implement Host controls: Play, Pause, Skip/Advance, Lock Room, Rotate Invite ([TEST-015](TESTING_STRATEGY.md#L21)).

**Phase 2 Exit Gate:** Queue operations replicate in $<100\text{ ms}$, snapshot syncs in $<2\text{ s}$, host disconnect freezes playback cleanly, and process restart recovers state up to the durable watermark.

---

Evidence (21 October 2026): 27 Jest tests and the multi-browser journey pass. Twenty local sequential votes rendered on both clients within 42.69 ms maximum; one join rendered within 265.20 ms. Real transaction abort/retry and killed-process recovery tests passed. These results cover this declared local workload, not Phase 6 load certification. See [implementation status](IMPLEMENTATION_STATUS.md) and [Phase 2 behavior/limits](PHASE_TWO_IMPLEMENTATION.md).

## Phase 3: Acoustic Matching & Grounded AI DJ

**Objective:** Hard BPM and Camelot harmonic compatibility enforcement, RAG-grounded transition text, and cited track Q&A.

### [x] TASK-014: Deterministic BPM / Camelot Filter & Segue Ranker
- [x] Implement pure tempo matcher: $\Delta = \min(|c/(b \cdot m) - 1|)$ for $m \in \{0.5, 1, 2\}$, enforcing $\Delta \le \text{tolerancePct}/100$ (default $8\%$, range $0\text{--}8\%$) ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L7)).
- [x] Implement Camelot key rule: allow same key, $\pm 1$ number on same letter (with $12 \leftrightarrow 1$ wraparound), or relative major/minor (same number, opposite letter). Reject all others ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L9)).
- [x] Author segue ranker with PRD weights: $50\%$ Harmonic Fit ($H$), $30\%$ Energy Fit ($E$), $20\%$ Recency ($R$) ([REQ-012](PROJECT_REQUIREMENTS.md#L24)).
- [x] Author property tests covering all 24 Camelot keys, boundary tempos, and tempo multipliers ([TEST-005](TESTING_STRATEGY.md#L11)).

### [x] TASK-015: Grounded Retrieval, Citation Engine & Track Q&A
- [x] Build in-process lexical retriever indexing authored timeline entries and acoustic facts for current/recent tracks ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L27)).
- [x] Construct strict Ollama prompt injecting retrieved context with immutable IDs; prohibit ungrounded lore generation.
- [x] Implement output validation pipeline: verify JSON schema, enforce character limits, and ensure all cited source IDs exist in context ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L31)).
- [x] Handle missing context: return explicit insufficient-metadata response (`insufficientMetadata: true`) with no invented facts.
- [x] Build `POST /api/v1/lounges/:id/ai/questions` endpoint with citation chips rendered in the UI ([TEST-006](TESTING_STRATEGY.md#L12)).

### [x] TASK-016: Outro Trigger, Segue Proposal & Stale Guard
- [x] Trigger segue evaluation $10\text{ seconds}$ before track completion ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L33)).
- [x] Generate segue proposal including match reason, tempo delta, and text transition banter.
- [x] Enforce timeout deadline ($2.3\text{ s}$): fall back to deterministic template on model failure or timeout (`generationMode: "template"`).
- [x] Implement stale proposal check: re-verify expected revision, current track ID, and acoustic eligibility before Host commit ([ARCHITECTURE.md](ARCHITECTURE.md#L65)).
- [x] Require explicit Host approval: `POST /api/v1/lounges/:id/ai/segue/:proposalId/decision` ([ADR-013](DECISIONS.md#L19)).
- [x] If no eligible track exists or proposal is rejected, pause playback at track end; an empty eligible set reports `NO_COMPATIBLE_TRACK`, rejection reports `rejected`.

Implementation checked off 26 October 2026; real-model and legal-audio acceptance remains open. See [as-built behavior and evidence](PHASE_THREE_IMPLEMENTATION.md). Approval reserves next; explicit Advance starts it. Rejection pauses at end; only an empty eligible set reports NO_COMPATIBLE_TRACK.

**Phase 3 Exit Gate (not yet certified with a real model/legal chain):** $100\%$ of approved segues strictly satisfy BPM and Camelot rules, Q&A cites authored IDs only, and transitions generate within $<3\text{ s}$ (with fallback rate logged).

---

## Phase 4: Live Chat, Sentiment & Soundclash Battles

**Objective:** Sentiment-aware curation driven by real-time chat, emoji reactions, and crowd-driven Soundclash battles.

### [x] TASK-017: Real-Time Chat, Reactions & Typing Indicators
- [x] Implement `POST /api/v1/lounges/:id/chat` with message validation ($\le 1{,}000$ characters, rate-limited to 5 msgs / 10 s per user) ([API_SPECIFICATION.md](API_SPECIFICATION.md#L54)).
- [x] Broadcast chat messages via `lounge.chat.message` and append to batch event buffer.
- [x] Build `PUT /api/v1/lounges/:id/chat/:mid/reactions` supporting allowlisted emojis and atomic user reaction toggling.
- [x] Implement ephemeral typing notifications: emit `lounge.chat.typing`, throttle to 1/s, expire after 3 seconds, omit from persistence.
- [x] Build Chat Console UI: message stream, reaction counters, typing status, and cursor-based history pagination ([TEST-007](TESTING_STRATEGY.md#L13)).

### [ ] TASK-018: Rolling Sentiment Pipeline & Accuracy Evaluation
- [x] Implement lexicon-based sentiment scorer with negation, intensifiers, and neutral band mapping scores to $[-1, 1]$ ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L19)).
- [x] Compute 30-second rolling sentiment window re-evaluated every 1 second; cap spam contribution per user per tick ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L21)).
- [x] Broadcast sentiment updates via `lounge.sentiment.score` and integrate with segue target energy ($E$).
- [ ] Assemble locked test split ($\ge 150$ labeled messages); verify $\ge 85\%$ classification accuracy and output confusion matrix ([REQ-013](PROJECT_REQUIREMENTS.md#L25)).
- [x] Verify that a sudden positive/negative chat burst shifts the lounge sentiment score within one 30-second window ([TEST-007](TESTING_STRATEGY.md#L13)).

### [x] TASK-019: Soundclash Battle Lifecycle & Immediate Splice Gate
- [x] Implement candidate submission: `POST /api/v1/lounges/:id/battles/candidates` (2--4 distinct tracks) ([REQ-009](PROJECT_REQUIREMENTS.md#L21)).
- [x] Implement battle opening: Host/Co-DJ via REST/socket or autonomously triggered by internal AI DJ actor when enabled (`soundclashEnabled=true`) with server deadline ($10\text{--}120\text{ seconds}$).
- [x] Implement battle voting: `PUT /api/v1/lounges/:id/battles/:bid/vote` (1 changeable vote per user).
- [x] Resolve battle at deadline:
  - If single winner is acoustically compatible with Now Playing $\to$ reserve immediate next.
  - If single winner is incompatible $\to$ mark `deferred`, leave in Next Up, announce deferral ([ADR-010](DECISIONS.md#L16)).
  - If tie or zero votes $\to$ transition to `awaiting_tie`, require Host or Co-DJ resolution ([OQ-05](PROJECT_REQUIREMENTS.md#L70)).
- [x] Prevent opening a second battle while one is active.
- [x] Build Soundclash Stage UI: candidate cards, live vote bars, countdown timer, and winner announcement banner ([TEST-008](TESTING_STRATEGY.md#L14)).

**Phase 4 Exit Gate:** Chat sentiment changes curation within 30 seconds with $\ge 85\%$ test accuracy, battles resolve idempotently across all clients, and incompatible winners are never forced into playback.

---

Software verification: 41 tests and the two-browser journey pass. The 150-example authored synthetic audit scored 149/150, but independent held-out annotation remains open; the Phase 4 exit gate is therefore qualified. See [as-built details](PHASE_FOUR_IMPLEMENTATION.md).

## Phase 5: Recommendations, Personal Dashboard & Session Analytics

**Objective:** Offline hybrid recommendations, personalized user dashboard, and mathematically reconciled session analytics.

### [ ] TASK-020: Server-Derived Interaction Tracking & Evaluation Dataset
- [x] Record listen interactions in `interactions` collection: derive played seconds from server playback intervals plus client heartbeat, capped by track duration ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L37)).
- [x] Mark track completed if listened $\ge 80\%$ duration; capture explicit likes.
- [x] Infer co-listening from shared lounge attendance rather than unbounded user pairs.
- [x] Build chronological evaluation split with zero target leakage (train on early sessions, evaluate on held-out sessions) ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L41)).

### [ ] TASK-021: Offline Hybrid Recommendation Worker & Atomic Artifact Swap
- [x] Implement worker thread in `server/src/recommendations/` to avoid blocking main Node.js event loop ([ARCHITECTURE.md](ARCHITECTURE.md#L81)).
- [x] Compute item-item collaborative cosine similarity from co-listening/completion matrices.
- [x] Compute acoustic feature similarity (BPM, key, energy, valence).
- [x] Blend hybrid scores: $60\%$ content + $40\%$ collaborative for active users; fall back to vibe/catalog popularity for cold starts ([AI_MUSIC_ENGINE.md](AI_MUSIC_ENGINE.md#L39)).
- [x] Implement atomic artifact swap without server restart; record `modelVersion`, cutoff date, and data hash.
- [ ] Validate $\text{Precision@5} \ge 0.6$ on the held-out evaluation dataset ([REQ-015](PROJECT_REQUIREMENTS.md#L27), [TEST-013](TESTING_STRATEGY.md#L19)).

### [x] TASK-022: Session Finalization, Event Replay & Analytics Reconciliation
- [x] Implement `POST /api/v1/lounges/:id/end`: flush all buffered events before marking session ended ([API_SPECIFICATION.md](API_SPECIFICATION.md#L43)).
- [x] Generate `session_summaries` record:
  - Exact duration (start to end events)
  - Peak participants (reconstructed from unique join/leave events)
  - Total battles opened and Q&A questions asked
  - Persisted sentiment timeline array
- [x] Implement verification test comparing final summary against raw event log replay and manual session audit ([TEST-014](TESTING_STRATEGY.md#L20)).

### [x] TASK-023: User Dashboard, Admin Job Manager & Recommendation Rail UI
- [x] Build `GET /api/v1/users/me/dashboard`: listening history, personal taste profile (listening-weighted BPM/energy), active lounges ([API_SPECIFICATION.md](API_SPECIFICATION.md#L60)).
- [x] Build `GET /api/v1/users/me/recommendations`: recommended track rail with explanation badges and fallback reason.
- [x] Build Admin controls: `POST /api/v1/admin/recommendation-jobs` to trigger refits and monitor training status ([API_SPECIFICATION.md](API_SPECIFICATION.md#L64)).
- [x] Build Session Analytics modal: timeline graph, battle count, participant peak, and track history.

**Phase 5 Exit Gate:** Hybrid recommendation model achieves $\text{Precision@5} \ge 0.6$, recommendations refresh dynamically after training, and session analytics reconcile exactly with event logs.

---


Software implemented; TASK-020/021 acceptance remains open for normal-use held-out data. Authored synthetic evaluation is qualified evidence. [As-built contracts](PHASE_FIVE_IMPLEMENTATION.md).

## Phase 6: Hardening, Performance Evidence & Private Deployment

**Objective:** Production-grade hardening, automated performance benchmarking under declared local hardware, backup/restore rehearsal, and complete submission documentation.

### [ ] TASK-024: Performance Harness, Multi-Room Stress & Latency Audit
- [x] Build multi-client load harness simulating 2 rooms with 5--10 users/room emitting 2 queue votes/s and 1 chat/s ([TEST-009](TESTING_STRATEGY.md#L15)).
- [ ] Measure and document real local latency distributions:
  - Queue update sync $< 100\text{ ms}$
  - Room fan-out $< 500\text{ ms}$
  - Non-AI REST API P95 $< 200\text{ ms}$
  - AI segue generation P95 $< 3\text{ s}$
- [x] Stress-test single-process bounds: test up to 50 concurrent participants if hardware allows; measure memory usage and event-loop lag ([TEST-012](TESTING_STRATEGY.md#L18)).
- [x] Save raw measurement logs and summary tables under `evidence/`.

### [ ] TASK-025: Security Audit, Penetration Checks & Accessibility Review
- [x] Execute security test suite ([TEST-011](TESTING_STRATEGY.md#L17)):
  - NoSQL injection and prototype pollution defenses
  - Stored XSS defense in chat, titles, and lore
  - Path traversal defense on audio upload and streaming
  - CSRF protection and exact-origin CORS checks
  - Prompt injection robustness in RAG Q&A
- [x] Run dependency vulnerability and secret audit (`npm audit`, git scan).
- [ ] Verify WCAG keyboard navigation and accessible color contrast across all React console views.

### [ ] TASK-026: Private Deployment Runbook & Backup/Restore Rehearsal
- [x] Configure single-instance deployment behind reverse proxy with TLS terminating at edge ([ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md#L55)).
- [x] Implement `/health/live` and `/health/ready` endpoints verifying DB connection, asset storage, and batch writer.
- [x] Rehearse backup and restore procedure: dump MongoDB and asset manifest, restore to clean volume, replay recovered state, and verify room epoch bump ([TEST-010](TESTING_STRATEGY.md#L16), [TEST-015](TESTING_STRATEGY.md#L21)).
- [x] Document rollback runbook in `docs/ENVIRONMENT_SETUP.md`.

### [ ] TASK-027: Multi-Session Demo, Retrospective & As-Built Documentation
- [x] Record end-to-end multi-browser demo video: 2 users, queue votes, chat sentiment shift, Soundclash battle, harmonic segue, cited Q&A, and session analytics dashboard.
- [x] Update all planning documents to reflect as-built reality (pinned package versions, real ports, measured performance).
- [x] Write final project retrospective: report actual vs. target metrics, hardware specifications, and documented limitations.

---

Actual stress evidence: two rooms with 50 clients each, 10-second warmup plus 60-second measurement, zero failures. This is short stress evidence, not ten-minute 50-client certification. The initial long ten-client run retained REST-429 failures. The corrected 600-second run recorded zero command failures but a 225 ms queue maximum, exceeding the 100 ms gate; concurrent desktop verification was present and isolated acceptance remains open.

Software checks above mean tools/templates/targeted checks, not full release certification. The restore rehearsal uses the documented custom offline logical dump (no Database Tools installed). The video uses synthetic silence and metadata. TLS deployment, full WCAG review, real-model latency and upstream data/license gates remain open. [Exact evidence and limitations](PHASE_SIX_IMPLEMENTATION.md).

## Phase Overview & Progress Tracking

| Phase | Milestone | Priority | Task Range | REQ Coverage |
| :--- | :--- | :---: | :---: | :--- |
| **Phase 0** | Scope, Legal Data & Feasibility Gate | P0 | `TASK-001` -- `TASK-003` | REQ-001, 002, 010, 015, 019 |
| **Phase 1** | Foundation & Vertical Slice | P1 | `TASK-004` -- `TASK-008` | REQ-002, 003, 004, 006, 010, 021 |
| **Phase 2** | Authoritative Queue & Real-Time Sync | P1 | `TASK-009` -- `TASK-013` | REQ-005, 006, 008, 018, 019, 020 |
| **Phase 3** | Acoustic Matching & Grounded AI DJ | P1 | `TASK-014` -- `TASK-016` | REQ-011, 012, 014, 019 |
| **Phase 4** | Live Chat, Sentiment & Soundclash Battles | P1 | `TASK-017` -- `TASK-019` | REQ-007, 009, 013 |
| **Phase 5** | Recommendations, Dashboard & Analytics | P1 | `TASK-020` -- `TASK-023` | REQ-010, 015, 016, 017 |
| **Phase 6** | Hardening, Performance & Deployment | P0 | `TASK-024` -- `TASK-027` | REQ-019, 020, 021, 022 |
| **Post-MVP** | Future Enhancements | P2 | `TASK-028` | Optional / Out of MVP |
