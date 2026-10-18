# Instructions for coding agents

## Authority and current status

The user authorized implementation on 18 October 2026. The foundation is implemented; read `docs/IMPLEMENTATION_STATUS.md` before continuing. Legal audio and LLM benchmarks remain open gates; metadata fixtures are not playable songs. Current user instructions take precedence. Primary project source is `Document/Project Document.docx` (v1.0, September 2026); read relevant sections and `docs/PROJECT_REQUIREMENTS.md` before changes. `docs/DECISIONS.md` distinguishes recommendations from unresolved choices. Do not silently turn open questions into confirmed requirements.

## Architecture constraints

- Recommended baseline is PRD Track A, Option B: React/Node/Express/Socket.IO/MongoDB/Mongoose in JavaScript, not TypeScript. Do not mix backend stack rows. Another stack needs an explicit documented scope decision.
- Real Spotify infrastructure/accounts/catalog/user data are excluded. Use only original/authorized local assets with provenance. No Spotify ingestion into AI, real DSP/crossfade, synthesized speech/music or public streaming.
- Keep one deployed application instance, modular services, one pooled database client and per-room serialized in-memory authority. Persist events in bounded batches. Do not claim exactly-once delivery or zero-loss crash recovery.
- Enforce hard BPM/Camelot eligibility in deterministic code before every AI/manual/battle immediate segue. Models cannot mutate queues or override rules.
- Server controls identity, membership, votes, clock, sentiment and state revision. Revalidate stale proposals. Apply one coherent snapshot per revision and resync on epoch/gap.
- Preserve all three PRD epics, including recommendations, analytics, moderation, chat typing/reactions and grounded Q&A; a queue demo is only an intermediate milestone.

## Workflow

When implementation is authorized, finish Phase 0 gates, then Phase 1's auth→create→join→snapshot slice. Work from `docs/TASKS.md` in dependency order. No delegation/subagent work is required by this file. Inspect existing files before editing and preserve unrelated user work. Do not install or start services merely to make a planning document appear tested.

Update requirements/decisions, architecture, schema, API, tasks and tests together when behavior changes. Preserve mandatory API examples and core socket event names or document a justified compatible change. Keep citations/versioned data for generated facts; insufficient metadata must produce an honest answer. Use local templates only as flagged fallback, not fabricated evidence of model success.

## Verification and safety

Run tests appropriate to changed behavior as defined in `docs/TESTING_STRATEGY.md`; report commands/results accurately. Require concurrency/replay checks for queue changes and HTTP/socket RBAC checks for permission changes. Measure latency/evaluation on declared hardware and datasets. Never invent benchmark results, passing tests, implementation completion or external access.

Use environment secrets, redacted logs, server validation, authenticated media containment and bounded buffers. Never commit passwords, JWTs, API keys, private chat or unlicensed audio. Database migrations need backup/restore and compatibility review; destructive resets must target explicitly verified disposable test data. Maintain migration/seed idempotency.

Consult `docs/EXTERNAL_CAPABILITIES.md` and reverify official sources before changing third-party assumptions. Do not introduce unrelated features, microservices, external integrations or credentials. End work with what changed, actual validation and material unresolved limitations.
