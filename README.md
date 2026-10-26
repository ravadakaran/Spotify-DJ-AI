# Spotify AI DJ Engine

Planning package for **AI DJ Studio: Collaborative Live Queue Curation & Sentiment-Aware Audio Engine**. This is a private prototype based on the supplied PRD, not a Spotify integration or an assertion of Spotify affiliation.

**Status: Phases 1–3 have software implementations.** Authentication, private catalog/profile APIs, lounge membership, concurrent queue/votes, playback, moderation, persistence/replay, acoustic ranking, cited Q&A and segue proposal approval work. Generation defaults to explicitly labeled templates; the local model adapter is opt-in. Chat, sentiment, battles, recommendations and analytics remain pending. Three seed profiles are metadata-only; the privately imported library has unverified reuse rights and pending acoustic profiles. Legal demonstration music and real-model quality/latency gates remain open. See [current verification](docs/IMPLEMENTATION_STATUS.md) and [Phase 3 behavior/configuration](docs/PHASE_THREE_IMPLEMENTATION.md).

## Run the current application

With Node 24.13.0 and npm installed:

```powershell
npm ci
npm run setup
npm run dev:local
```

Open [the local studio](http://127.0.0.1:5173), create an account, create a lounge, then join with its invite from another browser/private window. `dev:local` downloads a MongoDB binary if needed, runs a real single-node replica set without Docker, applies the initial schema/index migration, and seeds metadata. Data persists in ignored `data/local-db/`; Ctrl+C stops the local services. This helper is development-only. Docker setup is also available in [environment setup](docs/ENVIRONMENT_SETUP.md).

Validation: `npm run lint`, `npm test` (10 unit/integration tests), `npm run build`, and `npm run test:e2e` (two browser contexts; install Chromium with `npx playwright install chromium` first). See [implementation status and evidence](docs/IMPLEMENTATION_STATUS.md) for limitations and phase gates. The original planning ZIP is preserved as a historical artifact and does not contain the implementation.

## Scope and stack

Recommended delivery: PRD Track A (full stack), Option B: React, JavaScript, Vite, Tailwind CSS, Node.js, Express, Socket.IO, MongoDB and Mongoose; Jest/Supertest and Playwright for verification. Plain JavaScript is intentional: PRD §8 requires it for this option. PostgreSQL and TypeScript are evaluated in [decisions](docs/DECISIONS.md), but are not part of the selected plan.

Build private lounges with an authoritative live queue, votes and Soundclash battles; local audio playback; BPM/Camelot matching; chat sentiment; grounded text banter and Q&A; hybrid recommendations; session analytics; and four-role access control. Use original or appropriately licensed local audio and authored metadata. Real Spotify accounts/catalog/API access, waveform mixing, synthesized speech/music and public streaming are excluded by PRD §4.2.

## Read and develop in this order

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
| [EXTERNAL_CAPABILITIES](docs/EXTERNAL_CAPABILITIES.md) | Dated official-source verification and integration exclusions |
| [CONTRIBUTING](CONTRIBUTING.md) | Development and review workflow |
| [AGENTS](AGENTS.md) | Persistent implementation constraints |

Primary source: [Project Document.docx](Document/Project%20Document.docx), v1.0, September 2026. Its institutional branding is source text, not independently verified provenance. The ZIP packages generated documentation; retain the original source beside it when implementing.

## Setup, test and deployment preview

Prerequisites: Git, a supported Node LTS release pinned during Phase 1, npm, Docker/Compose for a local MongoDB replica set, three legal local audio assets and their profiles, and a local LLM runtime/model selected and benchmarked in Phase 0. An API key is needed only if a hosted LLM is deliberately selected. No Spotify credentials are required.

For an existing Docker replica set, the sequence is `npm ci`, `npm run setup`, `docker compose up -d mongo`, `npm run db:migrate`, `npm run db:seed`, and `npm run dev`. Docker Engine was unavailable during this implementation session; the isolated local replica-set path was tested. Load and AI evaluation scripts are not implemented yet and must not be treated as passing checks.

Deploy one application instance behind TLS with persistent MongoDB and asset volumes on a private host. Run migrations, readiness checks, a two-session smoke test and backup/restore verification before accepting the deployment. Do not horizontally replicate the in-memory room authority. See [setup](docs/ENVIRONMENT_SETUP.md) for the full procedure and rollback.

## First step

Next implement **Phase 2: authoritative queue and persistence** after reviewing its concurrency/durability decisions. Legal audio and local model benchmarking remain open Phase 0 gates for playback/AI work. The user's YouTube-sourced songs in `D:\DJ` were inspected by filename but not imported; no reuse license was established. The PRD's four-week schedule remains a source constraint, not a new delivery promise.
