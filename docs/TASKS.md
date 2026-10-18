# Ordered implementation backlog

Implementation has started; unchecked tasks may contain completed sub-items in [the phase checklist](PHASE_TODO_LIST.md). Full phase gates remain open. See [implementation status](IMPLEMENTATION_STATUS.md) for evidence and scope gaps. P0 means release-critical prerequisite, P1 means required MVP, P2 means optional later work. Phase order is in [implementation plan](IMPLEMENTATION_PLAN.md); TEST IDs refer to [testing](TESTING_STRATEGY.md). Dependencies are task IDs, not calendar dates. Every task's DoD includes reviewed code, relevant passing checks and updated documentation.

> [!TIP]
> For a granular, actionable breakdown of every task with sub-item checklists and phase exit gates, see [PHASE_TODO_LIST.md](PHASE_TODO_LIST.md).

| Done | ID | Priority / phase | Work and requirements | Dependencies | Acceptance / test | Reference |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | TASK-001 | P0 / P0 | Confirm track/stack and scope, REQ-001,002 | None | Decisions signed off; source conflicts explicit | [Decisions](DECISIONS.md) |
| [ ] | TASK-002 | P0 / P0 | Legal media/profile and larger eval dataset plan, REQ-010,015 | TASK-001 | ≥3-track chain feasible; licenses recorded, Precision@5 data plan | [AI](AI_MUSIC_ENGINE.md) |
| [ ] | TASK-003 | P0 / P0 | Model/hardware feasibility and behavior decisions, REQ-011,014,018,019 | TASK-001 | OQ-03–06 answered; model/license/context/latency assessed | [Requirements](PROJECT_REQUIREMENTS.md) |
| [x] | TASK-004 | P0 / P1 | Scaffold JavaScript workspaces/CI/Compose, REQ-002,022 | Independent scaffold implemented while TASK-002/003 gates remain open | Local install/build/lint/tests verified; Docker execution remains untested | [Setup](ENVIRONMENT_SETUP.md) |
| [ ] | TASK-005 | P0 / P1 | Schema migrations/indexes/seed, REQ-010,018 | TASK-004 | Fresh and rerun seed stable; invalid profiles rejected, TEST-002 | [Schema](DATABASE_SCHEMA.md) |
| [ ] | TASK-006 | P0 / P1 | Auth/refresh/RBAC, REQ-003,021 | TASK-005 | All roles tested, replay/expiry rejected, TEST-001 | [Security](SECURITY.md) |
| [ ] | TASK-007 | P1 / P1 | Catalog/media/profile API, REQ-001,010 | TASK-005, TASK-006 | Legal assets play privately; admin validation, TEST-002/011 | [API](API_SPECIFICATION.md) |
| [ ] | TASK-008 | P1 / P1 | Create/invite/join and initial UI, REQ-004,006 | TASK-006, TASK-007 | Two sessions see shared snapshot, TEST-002/015 | [Architecture](ARCHITECTURE.md) |
| [ ] | TASK-009 | P0 / P2 | Pure room reducer and concurrent votes, REQ-005 | TASK-008 | Atomic deterministic sort/idempotency, TEST-003 | [Architecture](ARCHITECTURE.md) |
| [ ] | TASK-010 | P0 / P2 | Event batch writer/replay/degradation, REQ-018,020 | TASK-009 | Flush/retry/crash tests and durable watermark, TEST-010 | [Schema](DATABASE_SCHEMA.md) |
| [ ] | TASK-011 | P1 / P2 | Socket snapshots/presence/reconnect, REQ-006,019 | TASK-009, TASK-010 | Join <2 s, gaps recover, TEST-004/012 | [API](API_SPECIFICATION.md) |
| [ ] | TASK-012 | P1 / P2 | Host moderation/transfer/freeze, REQ-008,021 | TASK-011 | Room-scoped role checks incl. sockets, TEST-001/004 | [Security](SECURITY.md) |
| [ ] | TASK-013 | P1 / P2 | Local playback clock and queue console, REQ-001,005,006 | TASK-011, TASK-012 | Unlock, pause/resume, frozen UI, TEST-015 | [Architecture](ARCHITECTURE.md) |
| [ ] | TASK-014 | P0 / P3 | BPM/Camelot filter and weighted ranking, REQ-011,012 | TASK-007, TASK-009 | ≥20 decisions 100% valid, TEST-005 | [AI](AI_MUSIC_ENGINE.md) |
| [ ] | TASK-015 | P1 / P3 | Retrieval/generation/Q&A and citations, REQ-014 | TASK-003, TASK-014 | Unsupported queries declined; audited facts, TEST-006 | [AI](AI_MUSIC_ENGINE.md) |
| [ ] | TASK-016 | P1 / P3 | Outro proposals/approve/reject/stale checks, REQ-012,014 | TASK-013, TASK-015 | One full chain and bounded fallback, TEST-005/006/009 | [API](API_SPECIFICATION.md) |
| [ ] | TASK-017 | P1 / P4 | Chat/history/typing/reactions UI+API, REQ-007 | TASK-010, TASK-012 | Persisted chat restored; ephemeral typing expires, TEST-007/011 | [API](API_SPECIFICATION.md) |
| [ ] | TASK-018 | P1 / P4 | Sentiment pipeline/evaluation, REQ-013 | TASK-017, TASK-014 | ≥85% locked-set accuracy, window shift, TEST-007 | [AI](AI_MUSIC_ENGINE.md) |
| [ ] | TASK-019 | P1 / P4 | Battle lifecycle/tie/defer/announcement, REQ-009 | TASK-012, TASK-016 | One winner effect; no incompatible splice, TEST-008 | [Architecture](ARCHITECTURE.md) |
| [ ] | TASK-020 | P1 / P5 | Interaction collection and fit dataset, REQ-015 | TASK-002, TASK-013 | Server-bounded listening; no split leakage, TEST-013 | [AI](AI_MUSIC_ENGINE.md) |
| [ ] | TASK-021 | P1 / P5 | Hybrid model worker/version swap, REQ-015 | TASK-020 | Precision@5 ≥0.6 with coverage; refresh no deploy, TEST-013 | [AI](AI_MUSIC_ENGINE.md) |
| [ ] | TASK-022 | P1 / P5 | Session end/summary/taste/history, REQ-016,017 | TASK-018, TASK-019, TASK-020 | Exact manual/log reconciliation, TEST-014 | [Schema](DATABASE_SCHEMA.md) |
| [ ] | TASK-023 | P1 / P5 | Dashboard/admin forms/recommendation rail, REQ-010,016 | TASK-007, TASK-021, TASK-022 | Real backend data and validation, TEST-015 | [API](API_SPECIFICATION.md) |
| [ ] | TASK-024 | P0 / P6 | Performance/multi-room/failure evidence, REQ-019,020 | TASK-016, TASK-019, TASK-023 | Declared workloads and raw latency/recovery results, TEST-009/010/012 | [Tests](TESTING_STRATEGY.md) |
| [ ] | TASK-025 | P0 / P6 | Security/privacy/accessibility review, REQ-021 | TASK-023 | No critical unresolved auth/data issue, TEST-001/011/015 | [Security](SECURITY.md) |
| [ ] | TASK-026 | P0 / P6 | Deployment/restore rehearsal, REQ-020,022 | TASK-024, TASK-025 | Fresh install and backup restore work, TEST-010/015 | [Setup](ENVIRONMENT_SETUP.md) |
| [ ] | TASK-027 | P0 / P6 | Demo, measured report, retrospective, as-built docs, REQ-022 | TASK-026 | All deliverable evidence reviewed; deviations visible | [Plan](IMPLEMENTATION_PLAN.md) |
| [ ] | TASK-028 | P2 / Later | Evaluate extraction/embeddings/multilingual improvements | TASK-027 | New requirement and evaluation justified first | [Decisions](DECISIONS.md) |

## Independent work and external dependencies

No subagents or parallel staffing are assumed. Work that can be interleaved: fixture/legal-asset preparation after TASK-001; pure matching after profile contract; chat UI and dashboard shells once API contracts stabilize; threat/test cases throughout. Integration still follows the dependencies above. TASK-003/015 need a local model download/hardware or approved hosted credentials; remote hosting credentials affect TASK-026 only. Nothing requires a Spotify developer account.

## Coverage audit

REQ-001–022 each appears in at least one task and one test. Storage covers profiles/timeline, membership, queue/battles/votes through snapshot/events, chat/reactions, interactions/model versions and final summaries. APIs route each mutation through the same room authority. Requirements spanning phases are not considered met until all linked behaviors pass. Track scope changes in [decisions](DECISIONS.md), then update this backlog, API/schema and tests together.
