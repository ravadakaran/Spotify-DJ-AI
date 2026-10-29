# Project requirements and source analysis

29 October 2026 hosting scope: user authorized preparing Vercel frontend and a single Google Cloud VM backend, then requested a new cloud project. REQ-001/018/020/021 retain private access, single server authority, authenticated media and existing storage/auth. Region, budget/size, domain, project ID and account setup remain open. This is hosting preparation, not a switch to Firebase Auth/Firestore or public streaming. [Deployment scope](VERCEL_GOOGLE_CLOUD_DEPLOYMENT.md).

28 October 2026 IMP-002: user requested admin library Edit, Replace audio and Delete controls, extending REQ-001/010/021. Whole-track mutations require all lounges ended, preserve shared files, validate versions and use authorized local media. Replacement requires confirmed acoustic values and clears old timeline notes. This enhancement is not an original PRD requirement. [Scope and limits](CATALOG_MANAGEMENT.md).

28 October 2026 frontend redesign: user authorized a new liquid-glass theme and frontend navigation/layout improvements while preserving all PRD requirements. No acceptance threshold or product scope changed. [Presentation and compatibility details](FRONTEND_REDESIGN.md).

28 October 2026: Phase 6 implements REQ-019/020/021/022 verification tooling and operating templates; measured evidence and qualified release gates are tracked in [implementation status](IMPLEMENTATION_STATUS.md). It changes no source requirement, schema or AI acceptance threshold. A scripted-client application measurement is separate from browser DOM rendering and real-model outro latency.

27 October 2026: Phase 5 software implements REQ-015–017 interactions, recommendation worker/rail, dashboard and end summaries. Normal-use held-out Precision@5 acceptance remains open; authored synthetic evaluation is software evidence only. [Contracts and limits](PHASE_FIVE_IMPLEMENTATION.md).


26 October 2026 Phase 4 scope: user authorized TASK-017–019. REQ-007/009 chat and Soundclash software and REQ-013 local sentiment pipeline are implemented. The 150-example synthetic audit passed 149/150; independently annotated held-out evaluation remains open. Legal media/model gates remain unchanged. [Behavior, evidence and rollout](PHASE_FOUR_IMPLEMENTATION.md).


26 October 2026 scope: user authorized Phase 3 (TASK-014–016). REQ-011/012 matching and REQ-014 grounded API/UI are implemented with explicit template fallback and an opt-in local adapter. Legal playable-chain and real-model quality/latency acceptance remain open. [As-built behavior](PHASE_THREE_IMPLEMENTATION.md) documents the compatible server-owned request contract and explicit approval/Advance semantics; it does not close Phase 0 gates.

Analysis date: 18 October 2026. Primary source: `Document/Project Document.docx`, PRD v1.0, September 2026, §§1–15. All body paragraphs and tables, the text-based architecture diagram, header/footer, and footnote/endnote/comment parts were inspected through OOXML. The package has no embedded image assets; note/comment parts contain no substantive text. No separate appendices were present. Page layout was not rendered; citations use section numbers, not inferred pages.

The initial pasted request required planning first; that package was delivered. On 18 October 2026 the user authorized implementation after making documentation changes. Current progress and explicit uncompleted gates are recorded in [implementation status](IMPLEMENTATION_STATUS.md). PRD title/branding does not establish external sponsorship.

## Source and interpretation rules

21 October 2026 scope: the user explicitly authorized TASK-009–013 while retaining Phase 0 gates. Queue/persistence/presence/moderation/playback are implemented as described in [Phase 2 implementation](PHASE_TWO_IMPLEMENTATION.md). The minimal hard compatibility guard is included before manual segues; Phase 3 ranking, generation and evaluation are not implicitly complete.

Current user scope clarification (19 October 2026): import the supplied YouTube-sourced files for private local preview, retaining unverified provenance. This does not certify licensing or satisfy the verified demo chain; no automatic acoustic values or lore are invented. See [decisions](DECISIONS.md).

**E** = explicit PRD requirement. **P** = provisional engineering recommendation. Requirements below are E unless marked P. The task prompt's candidate stack is not a replacement for PRD §8. Questions remain visible; suggested answers are not silently treated as approved requirements.

| ID | Requirement and source | Delivery |
| --- | --- | --- |
| REQ-001 | Local/private, single-operator prototype; owned/authorized audio, no real Spotify integration or DSP/audio generation (§§4,14) | All phases |
| REQ-002 | Choose one complete stack and delivery track; full-stack default; document both data-model approaches (§§3,4.3,8) | Phase 0 |
| REQ-003 | Register/login; JWT ≤1 hour, refresh, Listener/Co-DJ/Host/Admin authorization on HTTP and sockets (§§3,10) | MVP |
| REQ-004 | Create lounge with seed/vibe/rules, invite/join, capacity; end session (§§5,6.1) | MVP |
| REQ-005 | Now Playing, ordered Next Up, Soundclash Stage; atomic vote reorder, concurrent correctness (§6.1) | MVP |
| REQ-006 | Presence, connection quality, reconnect snapshot ≤2 seconds; deterministic host loss (§6.1) | MVP |
| REQ-007 | Chat/history, typing, emoji reactions; live sentiment indicator (§6.1) | MVP |
| REQ-008 | Mute/remove, lock room, transfer Host/Co-DJ authority (§6.1) | MVP |
| REQ-009 | Soundclash submission, 2–4 candidates, timed votes, winner splice and announcement (§§6.1–6.2) | MVP |
| REQ-010 | Admin profile/timeline upload; positive BPM, 24 Camelot keys, energy/valence in [0,1]; ≥3 tracks forming valid chain (§§6,12,14) | MVP |
| REQ-011 | BPM ±8% including half/double time AND identical/adjacent/relative Camelot key; hard eligibility (§6.2) | MVP |
| REQ-012 | Eligible segue rank: 50% harmonic, 30% sentiment energy fit, 20% recency; Host approval/override (§§5,6.2) | MVP |
| REQ-013 | Rolling positive/neutral/negative chat score influences curation within one window; ≥85% test accuracy (§§1.3,6.2) | MVP |
| REQ-014 | Outro-triggered grounded text transition and track Q&A with metadata citations; no invented lore (§6.2) | MVP |
| REQ-015 | Hybrid acoustic + collaborative recommendation learned from self-generated interactions, refresh without redeploy; Precision@5 ≥0.6 (§§1.3,6.3) | MVP |
| REQ-016 | Dashboard history, taste profile, quick rejoin and recommendations (§6.3) | MVP |
| REQ-017 | Analytics: duration, peak presence, battle/question counts, sentiment timeline exactly reconcile (§6.3) | MVP |
| REQ-018 | In-memory authority; append-only batched events/chat; final summaries rather than per-vote DB writes (§9.4) | MVP |
| REQ-019 | Local queue sync <100 ms; non-AI API P95 <200 ms; AI P95 <3 s; room fan-out <500 ms; design for 50 users/room and multiple rooms (§§1.3,10.2,14.1) | Evidence gate |
| REQ-020 | Structured redacted correlation logs, health checks, graceful reconnect (§10.3) | MVP |
| REQ-021 | Server validation, injection/XSS defense, environment secrets, short-lived JWT and refresh (§10.1) | All phases |
| REQ-022 | Incremental Git history, tests, API/socket examples, seed data, demo, measured results, retrospective and runnable docs (§§12–15) | Final gate |

MVP means the minimum complete PRD submission, not just a queue demo. Phase 1 is a walking skeleton and does not satisfy final acceptance. Keep recommendations, RAG, sentiment, moderation, typing and reactions in the MVP; simplify their algorithms before dropping required features. Later work: automatic feature extraction, larger licensed catalog, embeddings/vector search, improved multilingual sentiment, richer recommendation models and durable recovery without event loss. Celery/Redis, microservices, DSP, native apps, commercial streaming and Spotify ingestion are not MVP dependencies. Some are explicitly out of scope rather than promised later features.

## Users and journeys

Listener authenticates, joins by invite, receives current snapshot, chats/reacts, votes/submits a battle candidate, asks track questions and reconnects. Host creates/configures a lounge, starts local playback, approves a segue, moderates, transfers authority and ends the session. Co-DJ assists with queue overrides and battle resolution. Admin manages acoustic profiles. AI DJ is an internal service actor limited to eligible curation and announcements, not a privileged user token.

P: global admin is separate from lounge-scoped membership role; a user can host room A and listen in room B. A registered user may create a lounge and becomes its Host. Admin does not automatically gain arbitrary room participation. See [security](SECURITY.md) for the proposed permission matrix.

## Business invariants

One authoritative room mutation at a time. Every published state has an epoch and revision. Votes are idempotent and cannot multiply through reconnects. Now Playing is not reordered. AI, crowd and manual promotion must not bypass acoustic eligibility for an immediate segue. A room has one Host, at most one active battle and at most one accepted pending segue. Unknown metadata is not a fact. Room ending flushes history before a final summary is declared complete.

## Contradictions and resolution proposals

| Conflict or gap | Treatment |
| --- | --- |
| Project name suggests Spotify, but §4.2 excludes its infrastructure and data | Build local catalog; record external API findings separately, no Spotify adapter |
| Candidate TypeScript/PostgreSQL versus mandatory MERN JavaScript/MongoDB | Choose PRD Option B intact; alternatives require documented change of stack |
| §2 says “hear” generated transition; §§4.2/5 explicitly make banter text | Show text banter while local tracks play; no TTS |
| Configurable BPM tolerance versus hard ±8% | P: allow stricter 0–8% only; never wider without requirement change |
| Vote order/battle winner/Host promotion versus hard segue eligibility | P: preserve displayed vote order; only eligible entry can become immediate next; incompatible winner is deferred, never forced |
| Three tracks sufficient for segue, but Precision@5 evaluation | Need a separate larger evaluation catalog and interactions; three-track demo alone cannot establish Precision@5 |
| In-memory authority and batch writes versus reliability | Explicit bounded loss of unflushed events on crash; epoch reset and recovered snapshot, no implied exactly-once durability |
| Fixed four weeks (§14) versus request not to invent deadlines | Preserve source milestone mapping; no calendar dates or new effort estimates; confirm schedule relevance |
| <100 ms queue sync versus <500 ms fan-out | Measure both; queue mutations must meet stricter target in declared local conditions |

## Open questions and provisional defaults

| ID | Decision needed | Proposed default / impact |
| --- | --- | --- |
| OQ-01 | Confirm Track A vs B and Option B | A/B recommendation governs this plan; B delivery would remove UI, not backend requirements |
| OQ-02 | Is original four-week internship deadline applicable? | Keep relative checkpoints only; report scope/effort after first slice |
| OQ-03 | What hardware, deployment OS and LLM licenses/budget are available? | Private local runtime; model unresolved until license/context/latency evaluation |
| OQ-04 | Crash loss acceptable? | Up to 1-second/50-event pending buffer under healthy storage; freeze when writes fail, but crash may lose unflushed events |
| OQ-05 | Host loss and tied battles? | Freeze immediately after detected host loss; tie awaits Host/Co-DJ selection, no random winner |
| OQ-06 | Vote limits, repeat submissions, ranking priority? | One upvote/user/entry; one changeable battle vote/user; one active candidate/user; hard eligibility then reserved winner, manual promotion, AI score |
| OQ-07 | Sentiment window, language, N and outro? | English demo, 30-second window/1-second ticks, N=5, outro 10 seconds, explain limitations |
| OQ-08 | Auto-approval or explicit segue approval? | Host approves proposal; timeout does not silently authorize playback |
| OQ-09 | Retention, deletion, recovery objectives? | Private demo; configurable 30-day retention proposal; backup before migrations, no production SLA |
| OQ-10 | Listener audio synchronization expectations? | Authoritative scheduling + local playback only; no sample-accurate multi-device audio promise |
| OQ-11 | Journey mentions voting on energy shifts but defines no separate energy-vote contract | Baseline resolution: chat sentiment dynamically drives target energy fit (`E = 1 - abs(candidate.energy - targetEnergy)`); a separate dedicated up/down energy vote control is deferred until specified |

OQ-01, legal assets, hardware/model feasibility, and agreement on crash/queue semantics are Phase 0 gates. Other defaults may be implemented visibly and revised through decisions. See [tasks](TASKS.md) and [testing](TESTING_STRATEGY.md) for traceability; no requirements are marked complete by these documents.

28 October 2026 enhancement: IMP-001 first slice improves track selection without changing REQ-004/005/009/010 or release acceptance. [Scope and limitations](TRACK_SELECTION_ENHANCEMENT.md).

28 October 2026 automatic continuation: User requested automatic queued playback at track end (REQ-005/011/018). Reserved entry or queue head is revalidated; blocked/empty queues pause. [Behavior and validation](AUTOMATIC_QUEUE_CONTINUATION.md).

28 October 2026 listening-flow enhancement: Authorized listening-flow work improves discovery, eligibility explanation, playback/stale-action recovery, role-aware guidance, queue clarity and persisted recaps without changing hard rules or release thresholds. [Contracts, limits and actual validation](LISTENING_FLOW_IMPROVEMENTS.md).

28 October 2026 acceptance work: legal-audio and warm real-model evidence, failed independent sentiment quality, pending independent reader and ongoing final queue performance verification are documented in [acceptance closure](ACCEPTANCE_CLOSURE.md).
