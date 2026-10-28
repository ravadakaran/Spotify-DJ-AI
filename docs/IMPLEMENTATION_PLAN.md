# Implementation plan

28 October 2026: Phase 6 software/evidence tools and deployment/restore documentation implemented. Full exit gates remain qualified by real media/model and independent evaluation data, plus target-host TLS deployment. [As-built scope and retrospective](PHASE_SIX_IMPLEMENTATION.md).

Implementation is authorized and the independent Phase 1 foundation slice has been built and tested. Phase 0 legal-media/model gates remain explicitly open; neither phase is declared fully complete. See [implementation status](IMPLEMENTATION_STATUS.md). MVP includes every required Epic 1–3 behavior. The source's four checkpoints map roughly to P1, P2/P3, P4/P5, P6; no calendar dates or effort estimates are assigned. One engineer should build vertical slices and measure before committing a schedule. All requirements use IDs from [requirements](PROJECT_REQUIREMENTS.md); actionable items are in [tasks](TASKS.md).

## P0 — Scope, legal data and feasibility gate

- Objective: establish a defensible implementation baseline (REQ-001,002,010,019).
- Backend: select Option B intact; decide queue precedence, tie/freeze behavior and loss budget; inspect local LLM/model capability without building application features.
- Frontend: confirm Track A and text-only banter/local playback; sketch console state/empty/error screens.
- Database: review collections and batch durability; confirm replica-set deployment can run.
- Integrations/dependencies: legal local audio and metadata; local model artifact/license/hardware; no Spotify credentials. Hosted model is an alternative requiring separate review.
- Testing/security: prepare evaluation data plan and performance harness design, validate media provenance and secret handling.
- Deliverables: accepted decisions, asset/license manifest plan, pinned tooling/model selection record and resolved critical questions.
- Acceptance/DoD: choose A/B, ≥3 obtainable tracks with valid chain, demonstrate sufficient hardware/provider feasibility or document a specific alternative, agree OQ-04–06 semantics. No unresolved integration assumption blocks the first slice.
- Prerequisites: supplied PRD and these docs. Risk/rollback: change provisional stack/track now, updating all contracts before scaffolding; no application rollback needed.

## P1 — Foundation and one vertical slice

- Objective: register → login → create → join → snapshot across two sessions (REQ-003,004,010,021).
- Backend: npm workspaces, Express modules, validators, JWT/refresh, room membership, catalog/profile endpoints and health routes.
- Frontend: Vite React JavaScript app, auth, create/join flow, basic console snapshot; Tailwind styling and accessible forms.
- Database: migrations ledger, users/refresh/tracks/assets/lounges/memberships validators/indexes; seed ≥3 profiles with valid local files and no real credentials.
- Integrations: local MongoDB and authenticated media serving; minimal Socket.IO authentication/subscription.
- Testing/security: TEST-001/002/004/011; clean DB migration/seed rerun, rejected privilege escalation, logout/refresh replay.
- Deliverables: `client/`, `server/`, `package.json`, lockfile, `.env.example`, Compose, seed and migration scripts, first HTTP collection and smoke test.
- Acceptance/DoD: two distinct users share one room snapshot; invalid profile rejected; Listener cannot upload; commands documented and runnable from clean checkout.
- Prerequisite: P0. Risk/rollback: remove failed environment only after backup; forward migration repair; preserve source assets and avoid committing secrets.

## P2 — Authoritative queue and persistence

- Objective: reliable concurrent queue, presence and recovery (REQ-005,006,008,018,020).
- Backend: serialized room reducer, deduplicated votes, snapshot protocol, ping, reconnect, Host freeze, moderation, playback clock and bounded batch writer.
- Frontend: Now Playing/Next Up, votes, connection quality, frozen/degraded states, reconnection, local audio unlock and Host controls.
- Database: events, snapshots and receipt/recovery structures; unique revision indexes and transactional batch projection.
- Integrations: Socket.IO delivery recovery, local file Range access. No LLM required.
- Testing/security: TEST-003/004/009/010/012; concurrent votes, role transfer, tab-counting, forced process failure and partial batch retry.
- Deliverables: reducer/unit tests, crowd harness, event log, queue/recovery UI, initial real latency report.
- Acceptance/DoD: no divergent final state; new join <2 s; host-loss behavior deterministic; queue <100 ms in declared local test; persistence loss explicitly shown, no false durable ack.
- Prerequisite: P1. Risk/rollback: single-instance deployment only; stop commands/flush before downgrade; snapshot reducer version must be compatible or restore backup.

## P3 — Acoustic matching and grounded DJ

- Objective: one complete valid segue plus grounded Q&A (REQ-011,012,014).
- Backend: pure BPM/Camelot filter and weighted ranker, retrieval, local LLM adapter, output validation, timeout templates, proposal approval and stale-result guard.
- Frontend: match explanation, approve/reject, text banter feed, Q&A with visible citations, insufficient-data state.
- Database: versioned timeline metadata, persisted generated outcomes and question events; no vector store.
- Integrations: selected model/runtime; measure warm/cold behavior. Rule tests run without model.
- Testing/security: TEST-005/006/009/011; ≥20 decisions, threshold and wraparound cases, injection/unsupported fact cases, timeout/stale proposal tests.
- Deliverables: AI modules, retrieval fixtures, model/license record, evaluation scripts and demo of A→B→C with source IDs.
- Acceptance/DoD: 100% selected segues valid, generated facts supported, Q&A declines missing facts, P95 transition <3 s measured with fallback rate disclosed.
- Prerequisite: P2; metadata preparation may run alongside P1/P2. Risk/rollback: disable generation to deterministic templates on failure while retaining matching; this degraded mode does not alone satisfy grounded-model evidence.

## P4 — Chat, sentiment and Soundclash

- Objective: chat influences curation and crowd battles resolve consistently (REQ-007,009,013).
- Backend: persisted chat/reactions, ephemeral typing, sentiment windows, battle draft/open/tie/resolve/defer logic and timers.
- Frontend: chat/history, sentiment indicator, typing/reactions, Soundclash stage/tally/countdown, muted/closed states.
- Database: chat/reaction projections and batched sentiment/battle events; seed labeled sentiment fixture separately from evaluation holdout.
- Integrations: reuse generator for result banter; no model dependency in vote tally.
- Testing/security: TEST-007/008/009/011; one vote per user, tie and zero-vote, deadline, host freeze, incompatible winner, XSS and spam caps.
- Deliverables: complete Epic 1 console, sentiment evaluation report and battle recording/script.
- Acceptance/DoD: ≥85% sentiment accuracy on locked set; score changes within one window; one battle applies once on all clients; no incompatible forced segue.
- Prerequisite: P2 for battle state, P3 for integrated announcement/curation. Risk/rollback: pause new battles when faulty; preserve event history, revert scorer version with clearly recorded outputs.

## P5 — Recommendations, dashboard and analytics

- Objective: complete Epic 3 (REQ-015,016,017).
- Backend: bounded interaction capture, offline hybrid fitting, atomic model version swap, user history/taste/recommendation and summary APIs.
- Frontend: personal dashboard, quick rejoin, recommendation rail, session metrics/timeline, admin profile editor and job status.
- Database: interactions/model versions/session summaries, aggregation indexes; larger legal evaluation catalog and recorded test sessions.
- Integrations: worker thread, local artifacts. No paid recommendation service.
- Testing/security: TEST-008/013/014; chronological leakage-free evaluation, cold start, failed training, private-history checks and manual summary reconciliation.
- Deliverables: model/data manifests, metrics report, dashboard/admin UI, end-session flush evidence.
- Acceptance/DoD: Precision@5 ≥0.6 under declared eligible-user protocol, rail changes after data/refit without redeploy, exact summary/log reconciliation.
- Prerequisite: P2 and P4 event semantics. Dataset preparation and dashboard shell can proceed independently after contracts. Risk/rollback: keep previous active model; summary rebuild from events; never overwrite evaluation holdout to raise scores.

## P6 — Hardening, deployment and submission

- Objective: reproducible private deployment with honest acceptance evidence (REQ-019–022).
- Backend/frontend: finish error/accessibility states, health/readiness, graceful shutdown and operational instrumentation; no new feature expansion.
- Database: validate all indexes/migrations on fresh and populated DB; backup/restore rehearsal; define retention.
- Integrations: private TLS proxy, CI, persistent volumes, chosen LLM runtime. Reverify any third-party capability changed since planning.
- Testing/security: full suite, 5–10-client local run minimum honestly labeled; attempt 50 on suitable hardware; multiple-room isolation, latency distributions, security/secret scan.
- Deliverables: lockfiles, release build, runbook, API collection, raw measurements and report, demo recordings, retrospective, updated as-built docs.
- Acceptance/DoD: all REQ IDs mapped to passing tests or explicitly declared deviations; fresh reader reproduces setup/demo; backup restores; no fabricated tests or source claims; performance reports give hardware/workload/sample sizes and failures.
- Prerequisite: P1–P5. Risk/rollback: drain rooms, back up, migrate, deploy one instance, smoke test; restore previous artifact with schema compatibility or restore backup to a new volume. Do not declare complete with missing required evidence.

## Global completion rule

For every phase: implementation reviewed, relevant automated tests passing, security cases checked, docs/API/schema updated, and evidence attached to its task IDs. Phase completion does not mean every future phase is done. Deviations need rationale and a requirement change record; reduced catalog/model sophistication is preferable to omitting tests. External credentials are needed only for a deliberately chosen hosted LLM or private remote hosting, not for core local development.
