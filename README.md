# Spotify AI DJ Engine

Implementation and documentation for **AI DJ Studio: Collaborative Live Queue Curation & Sentiment-Aware Audio Engine**. This is a private prototype based on the supplied PRD, not a Spotify integration or an assertion of Spotify affiliation.

**Status: Phases 1–6 software is implemented with qualified release acceptance.** All three epics include queue/playback/moderation, grounded text Q&A/segue approval, chat/sentiment/battles, hybrid recommendations and personal/session analytics. Phase 6 adds repeatable multi-room load evidence, security/accessibility checks, private deployment templates and an offline backup/restore rehearsal. Templates are labeled; strict long-run queue max latency, real-model, licensed media and independent evaluation gates remain open. No live private TLS deployment is claimed. See [actual verification](docs/IMPLEMENTATION_STATUS.md), [Phase 6 details](docs/PHASE_SIX_IMPLEMENTATION.md) and [private deployment runbook](docs/PRIVATE_DEPLOYMENT.md).

## Run the current application

With Node 24.13.0 and npm installed:

```powershell
npm ci
npm run setup
npm run dev:local
```

Open [the local studio](http://127.0.0.1:5173), create an account, create a lounge, then join with its invite from another browser/private window. `dev:local` downloads a MongoDB binary if needed, runs a real single-node replica set without Docker, applies the initial schema/index migration, and seeds metadata. Data persists in ignored `data/local-db/`; Ctrl+C stops the local services. This helper is development-only. Docker setup is also available in [environment setup](docs/ENVIRONMENT_SETUP.md).

Validation: `npm run lint`, `npm test` (unit and real-replica-set integration suites), `npm run build`, and `npm run test:e2e` (two browser contexts; install Chromium with `npx playwright install chromium` first). See [implementation status and evidence](docs/IMPLEMENTATION_STATUS.md) for limitations and phase gates. The original planning ZIP is preserved as a historical artifact and does not contain the implementation.

## Scope and stack

Recommended delivery: PRD Track A (full stack), Option B: React, JavaScript, Vite, Tailwind CSS, Node.js, Express, Socket.IO, MongoDB and Mongoose; Jest/Supertest and Playwright for verification. Plain JavaScript is intentional: PRD §8 requires it for this option. PostgreSQL and TypeScript are evaluated in [decisions](docs/DECISIONS.md), but are not part of the selected plan.

Build private lounges with an authoritative live queue, votes and Soundclash battles; local audio playback; BPM/Camelot matching; chat sentiment; grounded text banter and Q&A; hybrid recommendations; session analytics; and four-role access control. Use original or appropriately licensed local audio and authored metadata. Real Spotify accounts/catalog/API access, waveform mixing, synthesized speech/music and public streaming are excluded by PRD §4.2.

## Read and develop in this order

For the requested Vercel frontend and single Google Cloud VM setup, see [cloud deployment](docs/VERCEL_GOOGLE_CLOUD_DEPLOYMENT.md). Configuration is prepared; cloud provisioning and live verification remain pending.

| File | Purpose |
| --- | --- |
| [PROJECT_REQUIREMENTS](docs/PROJECT_REQUIREMENTS.md) | Source analysis, requirement IDs, contradictions, scope and questions |
| [DECISIONS](docs/DECISIONS.md) | Stack rationale and provisional behavior choices |
| [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md) | Ordered phases and completion gates |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Components, diagrams and recovery model |
| [DATABASE_SCHEMA](docs/DATABASE_SCHEMA.md) | Collections, relational comparison, constraints and migration plan |
| [API_SPECIFICATION](docs/API_SPECIFICATION.md) | REST, authentication, payloads and socket contracts |
| [AI_MUSIC_ENGINE](docs/AI_MUSIC_ENGINE.md) | Exact matching, sentiment, retrieval and recommendation design |
| [TESTING_STRATEGY](docs/TESTING_STRATEGY.md) | Requirement-linked checks and honest performance evidence |
| [SECURITY](docs/SECURITY.md) | Roles, tokens, validation, privacy and operational controls |
| [ENVIRONMENT_SETUP](docs/ENVIRONMENT_SETUP.md) | Planned prerequisites, variables, commands and deployment runbook |
| [TASKS](docs/TASKS.md) | Ordered, unchecked implementation backlog |
| [PHASE_TODO_LIST](docs/PHASE_TODO_LIST.md) | Granular phase-by-phase implementation checklists and DoD gates |
| [PHASE_SIX_IMPLEMENTATION](docs/PHASE_SIX_IMPLEMENTATION.md) | As-built Phase 6 hardening, load benchmarks, security audits, and deployment runbooks |
| [PRIVATE_DEPLOYMENT](docs/PRIVATE_DEPLOYMENT.md) | Private deployment runbook, Caddy/systemd templates, and backup/restore rehearsal |
| [EXTERNAL_CAPABILITIES](docs/EXTERNAL_CAPABILITIES.md) | Dated official-source verification and integration exclusions |
| [CONTRIBUTING](CONTRIBUTING.md) | Development and review workflow |
| [AGENTS](AGENTS.md) | Persistent implementation constraints |

Primary source: [Project Document.docx](Document/Project%20Document.docx), v1.0, September 2026. Its institutional branding is source text, not independently verified provenance. The ZIP packages generated documentation; retain the original source beside it when implementing.

## Setup, test and deployment preview

Prerequisites: Git, a supported Node LTS release pinned during Phase 1, npm, Docker/Compose for a local MongoDB replica set, three legal local audio assets and their profiles, and a local LLM runtime/model selected and benchmarked in Phase 0. An API key is needed only if a hosted LLM is deliberately selected. No Spotify credentials are required.

For an existing Docker replica set, the sequence is `npm ci`, `npm run setup`, `docker compose up -d mongo`, `npm run db:migrate`, `npm run db:seed`, and `npm run dev`. Docker Engine was unavailable during this implementation session; the isolated local replica-set path was tested. `npm run benchmark` runs the declared two-room workload; `npm run recommendations:evaluate` evaluates the authored synthetic dataset. Neither certifies real-model or normal-use data quality.

Deploy one application instance behind TLS with persistent MongoDB and asset volumes on a private host. Run migrations, readiness checks, a two-session smoke test and backup/restore verification before accepting the deployment. Do not horizontally replicate the in-memory room authority. See [setup](docs/ENVIRONMENT_SETUP.md) for the full procedure and rollback.

## Verification and operations

Run `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm audit` and `npm run security:scan`. The browser journey records a synthetic-media demo and checks keyboard paths/rendered contrast. Run `npm run benchmark` separately from other tests; defaults are 60-second warmup and 600-second measurement with 10 clients per room. Use `BENCH_USERS=50` for a separately declared stress run.

Backups contain private data. Stop all writers, set `BACKUP_WRITERS_STOPPED=true`, then run `npm run backup -- backup NEW_PRIVATE_DIRECTORY`. Restore only into a separately configured empty database/asset directory with `npm run backup -- restore PRIVATE_DIRECTORY`. Read the [runbook](docs/PRIVATE_DEPLOYMENT.md) first. Phase 6 never migrated or reset the existing private library.
