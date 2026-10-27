# Architecture decisions

27 October 2026 — ADR-020: user requested Phase 5. Implement explicit admin refits, binary completion/like item cosine with 60/40 acoustic/collaborative blend; bounded identity heartbeat evidence, durable interaction projections and Host-only synchronous end barrier. Preserve legal/model/independent-evaluation gates. Authored synthetic metrics do not establish normal-use recommendation acceptance. [Definitions, bounds and migration compatibility](PHASE_FIVE_IMPLEMENTATION.md).


26 October 2026 — ADR-019: user requested Phase 4. Implement TASK-017–019 using the visible proposed defaults: English local lexicon, 30-second latest-per-participant window/one-second ticks, one changeable battle vote, two to four distinct submissions, Host/Co-DJ tie selection and incompatible-winner deferral. Internal DJ opens an existing draft at outro for 30 seconds. Use embedded reaction arrays in the batch-written chat projection. Synthetic sentiment audit is separate from independent held-out acceptance. Migration 004 is additive; rollback needs a matching backup because old code cannot replay new event types. [As-built contracts and limits](PHASE_FOUR_IMPLEMENTATION.md).


26 October 2026 — ADR-018: user requested Phase 3. Implement TASK-014–016 with constrained source-ID selection, default labeled templates, explicit Host/Co-DJ reservation approval and existing explicit Advance. Generation runs outside room serialization and revalidates on publish/approval. All new requests use server-owned context. Model/license/legal media gates remain open; see [Phase 3 implementation](PHASE_THREE_IMPLEMENTATION.md) for bounds, compatibility and rollout/rollback consequences.

Status: foundation implementation started on user instruction, 18 October 2026. Track A/Option B is the implemented baseline; unimplemented behavior choices remain provisional. Source requirements outrank these recommendations. Record future changes with date, owner, affected REQ IDs and migration/test consequences.

## Implementation update — 18 October 2026

The user requested review of edited docs and implementation. Their additions (phase checklist, architecture HTML/JSON, sentiment-driven energy clarification) are preserved. Proceeded with independent foundation work while explicitly retaining the Phase 0 media/model gates: Windows host, Node 24.13.0, approximately 32 GiB RAM, Docker installed but engine stopped, no Ollama command found. No GPU or model throughput is claimed. The user identified `D:\DJ` as songs sourced from YouTube; no license was established, so none was copied, analyzed or ingested. Seed profiles have null assetId and `demoMetadataOnly=true`.

ADR-015: the working local helper uses mongodb-memory-server to launch a real MongoDB replica set with persistent files under `data/local-db`, enabling development without running Docker. Tests use separate disposable instances. This does not replace MongoDB with an in-memory fake or change the one-process application architecture.

ADR-016: Phase 1 persists low-frequency lounge/membership changes transactionally; the future high-frequency queue still requires in-memory authority and batched persistence in Phase 2. Current capacity counts reserved memberships, not online sockets; no presence/host-loss behavior is claimed yet. Browser Socket.IO uses WebSocket transport explicitly, allowing strict Origin validation without weakening it for same-origin polling requests that omit Origin.

ADR-017: a dependency override pins js-yaml 4.3.2 for development tooling to remove the vulnerable legacy chain. The config loader uses the compatible `load` API. Production and full dependency audit must stay clean. Exact application dependencies are recorded in package-lock.json; no model dependencies are selected yet.

| ADR | Decision | Alternatives and rationale | Status / trade-off |
| --- | --- | --- | --- |
| ADR-001 | Track A, Option B: MERN JavaScript | Python/FastAPI/PostgreSQL is attractive for scientific tooling and allowed as Option C; Java/Spring is also allowed. Node suits shared realtime/event logic and avoids a second language for this small build | Provisional pending OQ-01; cannot mix PostgreSQL/TypeScript into Option B without changing PRD scope |
| ADR-002 | React + Vite + Tailwind, JavaScript modules/JSDoc | TypeScript offers stronger compile-time contracts but explicitly conflicts with Option B. Next.js SSR adds little to private console; plain CSS is viable | Recommended; runtime schema validation and tests carry contract safety |
| ADR-003 | Express + Socket.IO, one process | Fastify possible technically but not the chosen PRD row. Native WS would require more reconnect/room plumbing; microservices add operational burden | Recommended; Socket.IO does not supply durable exactly-once delivery |
| ADR-004 | MongoDB + Mongoose, local replica set | PostgreSQL has stronger FK/relational constraints but belongs to another PRD option. Embedded timeline fits read path | Recommended; explicit service integrity checks and transaction setup required |
| ADR-005 | In-memory per-room serialized authority and batched history | Synchronous per-vote DB transactions conflict with §9.4 and latency intent. Redis/distributed coordination unnecessary on one instance | Explicit PRD direction; loss window requires OQ-04 agreement |
| ADR-006 | Local legal catalog, manual feature ingestion | Real Spotify excluded; automatic extraction optional and not needed to demonstrate valid matching | Source-mandated exclusion; preserves offline reproducibility |
| ADR-007 | Deterministic matching, local sentiment, lexical RAG + local model | LLM deciding order is nondeterministic; embeddings unnecessary at initial scale; remote model adds privacy/cost dependencies | Model artifact remains undecided until hardware/license/latency checks |
| ADR-008 | Room-scoped Listener/Co-DJ/Host, separate global Admin | PRD reference users.role alone would incorrectly grant Host authority across all rooms | Provisional clarification; all four roles still enforced |
| ADR-009 | Freeze on detected Host loss; ties await authorized choice | Automatic succession possible but requires successor ordering and consent rules absent from source | Provisional OQ-05; deterministic and testable, temporarily stalls playback |
| ADR-010 | Hard compatibility overrides crowd/manual immediate-next choices | Blind winner splice could violate 100% segue rule | Provisional OQ-06; incompatible winners deferred with explanation |
| ADR-011 | 15-minute JWT + rotating refresh cookie | LocalStorage bearer tokens increase exposure; long-lived JWT fails source limit | Recommended; CSRF/origin protections and revocation handling needed |
| ADR-012 | Worker-thread hybrid fitting and atomic artifact swap | Full model service/vector DB unjustified; content-only fallback does not replace hybrid requirement | Recommended; larger held-out dataset necessary |
| ADR-013 | Explicit Host approval before segue commit | Auto mode could better automate DJ but approval semantics are unspecified | Provisional OQ-08; rejected/timed-out proposal pauses rather than auto-plays |
| ADR-014 | Preserve four-week source constraint as relative checkpoints | New dates/guaranteed estimates would be invented | OQ-02 unresolved; schedule relevance must be confirmed |

## Deferred decisions and change criteria

21 October 2026: the explicit Phase 2 request confirms bounded-batch durability, immediate last-Host-socket freeze, 10-second participant grace, atomic Host transfer and deterministic vote ordering. [Phase 2 implementation](PHASE_TWO_IMPLEMENTATION.md) records the concrete bounds, retry window, coalesced snapshot transport, manual resume/advance and buffered Web Audio playback. OQ-04/05 are resolved for this slice only: no zero-loss delivery or automatic Host succession is promised. Phase 0 model/licensing gates remain open.

19 October 2026 implementation scope clarification: the user explicitly requested adding their YouTube-sourced local songs. Private local import and authenticated previews are implemented with unverified provenance recorded, without claiming rights clearance, publishing media or ingesting it into AI. This exception does not close TASK-002. Content detection supports audio-only MP4/AAC as well as WAV/MP3 because the supplied files have misleading `.mp3` extensions. Acoustic profiles stay pending until authored or measured.

OQ-03 selects exact Node/package versions, model/license/runtime and hardware. Pin supported compatible releases and lockfiles during implementation; this plan makes no “latest version” claims. OQ-04 resolves data loss/recovery requirements. OQ-07 sets sentiment language/window, recency depth and outro timing. OQ-09 sets privacy retention and deletion. OQ-10 confirms that local scheduling is sufficient for playback expectations.

Add Redis/distributed room ownership only when a measured single-instance limitation requires it. Add embeddings only if lexical retrieval demonstrably misses authored facts. Add automatic audio analysis only for authorized local files and when manual profiles become a proven bottleneck. Revisit database/stack only through an explicit source deviation, not incidental implementation convenience. Real Spotify integration is a separate scope/policy assessment, not a future checkbox automatically inherited from this plan.

No provisional choice is a claim of user approval. Phase 0 makes critical choices concrete; other defaults should remain visible in configuration, docs and tests until confirmed.
