# Environment setup and operations

The **foundation is runnable**. Use the current instructions below; the later sections describe the full future setup contract and include settings/features not implemented yet.

Phase 2 is now included in these commands. Stop the prior app before migration. Migration 003 adds live event/checkpoint collections; preserve a database backup and asset manifest first. The `library:import` helper creates an ignored Extended JSON backup before migrating the persistent local database. Never run two application instances against these room states. Recovery pauses playback and requires Host resume. See [Phase 2 operating and rollback notes](PHASE_TWO_IMPLEMENTATION.md).

## Current quick start (Windows / Node 24.13.0)

```powershell
npm ci
npm run setup
npm run dev:local
```

Open `http://127.0.0.1:5173` (use this exact host, not localhost, for configured Origin/cookies). This local helper launches a real single-node MongoDB replica set without Docker, applies indexes, seeds three metadata-only tracks, and starts Express/Vite. It may download the MongoDB executable on first run. DB files live under ignored `data/local-db`; assets under ignored `data/assets`. The app remains local-only; no LLM or Spotify credentials are needed for this slice. Ctrl+C stops the helper. Do not run browser E2E tests while the app occupies ports 3000/5173.

Alternative: start Docker Engine, run `docker compose up -d mongo`, then `npm run db:migrate`, `npm run db:seed`, `npm run dev`. The Compose file is deliberately loopback-only without DB authentication and is **not a production deployment configuration**. The Docker path has not been executed here because Docker Engine was stopped.

`npm run setup` creates a private random JWT key in .env only if that file does not already exist; it never prints the secret. Current supported variables are NODE_ENV, PORT, APP_ORIGIN, MONGODB_URI, JWT_SIGNING_KEY, JWT_ISSUER, JWT_AUDIENCE, COOKIE_SECURE and ASSET_ROOT. Remaining variables below are planned.

Admin creation against the configured database requires a temporary password environment variable plus interactive email/display name. In PowerShell 7, set `$env:ADMIN_PASSWORD = Read-Host 'New admin password (12+ characters)' -MaskInput`, run `npm run admin:create`, then `Remove-Item Env:ADMIN_PASSWORD`. No default admin/password is seeded. While `dev:local` runs, use `npm run admin:create:local` to target its ignored connection file; application users cannot promote themselves.

To import the user's local library, stop `dev:local` first, then run `npm run library:import -- D:\DJ` and restart `npm run dev:local`. The importer opens the persistent local database, saves a private Extended JSON backup, applies migrations, and copies supported audio into the private asset directory. SHA-256 identifiers make reruns idempotent. WAV/MP3/audio-only MP4 are identified by content, including mislabeled extensions. No transcoding occurs. Reports are in `data/import-reports/latest.json`; originals remain unchanged. The library supports search, authenticated previews and administrator acoustic-profile edits. Imported acoustic values remain blank until authored or measured; import provenance does not establish a license.

Migrations 001/002 are immutable after application. A checksum mismatch fails startup. A stale migration lock requires verifying that the old runner has stopped before an operator removes that exact lock; never reset the database to bypass it. Import backups preserve documents as Extended JSON; production backup/restore rehearsal remains Phase 6 work.

Checks: `npm run lint`, `npm test`, `npm run test:integration`, `npm run build`; install browser with `npx playwright install chromium`, then `npm run test:e2e`. Unit/API tests and browser tests create their own disposable MongoDB replica sets. There is no load-test or AI-evaluation command yet. `npm start` serves the compiled client/API after build against an already configured database. See [implementation status](IMPLEMENTATION_STATUS.md) for validated results and incomplete features.

## Planned full-system contract

## Prerequisites and layout

Install Git, a supported Node LTS version selected in P0 and pinned in `.node-version`/package engines, its compatible npm, and Docker Desktop/Engine with Compose. Allow resources for one MongoDB replica set, one Node app and the chosen local model. No fixed RAM/GPU requirement is invented before selecting the model. Use original/authorized audio files and record licenses/attribution. Obtain remote-host credentials only if using a private VM; Spotify credentials are unnecessary.

Proposed layout: `client/` React app, `server/src/` domain modules, `server/migrations/`, `server/seeds/`, `tests/`, `scripts/`, `data/assets/` ignored legal audio, `data/models/` ignored fitted artifacts, `evidence/` sanitized reports, `docs/` these files. A local LLM runs separately on loopback; it is infrastructure, not a second custom backend framework.

## Environment contract

| Variable | Example/nonsecret default | Use |
| --- | --- | --- |
| NODE_ENV | development | Production disables development shortcuts |
| PORT | 3000 | Express/socket server |
| APP_ORIGIN | http://127.0.0.1:5173 | Exact development browser origin; production HTTPS |
| MONGODB_URI | operator-provided, never committed | Replica set database; authenticated private connection |
| JWT_SIGNING_KEY | generate locally, no example key | Access JWT signing secret/key material |
| JWT_ISSUER / JWT_AUDIENCE | ai-dj-local / ai-dj-client | Token verification |
| ACCESS_TOKEN_TTL_SECONDS | 900 | ≤3600 per PRD |
| REFRESH_TOKEN_TTL_DAYS | 7 | Proposed refresh family lifetime |
| COOKIE_SECURE | false on loopback only | Must be true with HTTPS deployment |
| ASSET_ROOT | absolute private assets path | Contained file serving |
| MODEL_ARTIFACT_ROOT | absolute private model path | Recommendation artifacts |
| LLM_PROVIDER | local | Local adapter, template fallback on failure |
| LLM_BASE_URL | http://127.0.0.1:11434 | Operator-controlled; not user input |
| LLM_MODEL | selected during TASK-003 | Exact pinned artifact identifier; no assumed model |
| LLM_TIMEOUT_MS | 2300 | Proposed deadline, measured in P3 |
| LLM_API_KEY | unset locally | Only if a hosted provider is chosen; server-only secret |
| EVENT_FLUSH_MS / EVENT_BATCH_SIZE | 1000 / 50 | Batched persistence |
| ROOM_MAX_PARTICIPANTS | 50 | Design capacity, not claimed measured capacity |
| ROOM_MAX_QUEUE_ENTRIES | 200 | Proposed buffer/state bound |
| SENTIMENT_WINDOW_SECONDS / SENTIMENT_TICK_MS | 30 / 1000 | Proposed rolling window |
| RECENCY_TRACK_COUNT / OUTRO_SECONDS | 5 / 10 | Proposed rank/scheduler config |
| LOG_LEVEL | info | Redacted structured logs |
| RETENTION_DAYS | 30 | Proposal pending OQ-09 |

No `VITE_` variable may contain secrets; browser variables are public. Serve REST/socket through the Vite development proxy and one production origin where possible. Copy future `.env.example` to ignored `.env`, then generate secrets locally using a secure generator without pasting them into chat or Git. Validate required configuration at boot and fail with redacted errors.

## Planned first-run procedure

1. Clone the future implementation repo and check out a documented revision. Install the pinned Node version and run `npm ci` against the committed lockfile.
2. Create `.env` from the future example; configure paths and secrets. Check assets are inside the configured root with a provenance manifest.
3. Run `docker compose up -d mongo`. The future service must initialize replica set `rs0`, expose a healthy primary and persist a named volume. Configure authentication/private binding; do not expose database port to public networks.
4. Run `npm run db:migrate`, then `npm run db:seed`. Seeder creates three legal demo profiles and related assets idempotently; admin bootstrap uses a separate `npm run admin:create` interactive command with no default password.
5. Select/download the approved local model outside Git, record its license and artifact version, start the runtime and verify a grounded response. Populate LLM_MODEL; core app should start with explicitly visible generation degradation if unavailable.
6. Run `npm run dev` to launch API/client. Open the displayed local URL, register two accounts, create/join a lounge, unlock audio and exercise one vote/segue path.
7. Verify `/api/v1/health/live` and `/api/v1/health/ready`. Readiness requires DB/writer/assets, not optional generation.

The implementation must supply npm scripts: `dev`, `build`, `start`, `lint`, `test`, `test:integration`, `test:e2e`, `test:load`, `eval:ai`, `db:migrate`, `db:seed`, `admin:create`. Record actual ports/commands when built. Integration tests use a separate DB and never run cleanup against a non-test URI. Follow [testing strategy](TESTING_STRATEGY.md) before marking the setup reproducible.

## Deployment and rollback

Use a single private VM/container host. Build client assets with `npm run build`; serve them and API/socket from one TLS origin. Persistent volumes hold MongoDB, authorized audio, recommendation artifacts and encrypted backup exports. Run the app as a non-root user with only required volume access. Proxy must support WebSocket upgrade and appropriate idle timeout. LLM/DB bind internal interfaces. No horizontal app replicas until distributed ownership is designed.

Release sequence: stop new room creation, announce/drain active sessions, flush events, create paired database/asset-manifest backup, apply tested migrations, deploy pinned artifact, verify readiness and two-session smoke flow, then reopen. Capture release ID and model versions. Zero-downtime deployment is not promised for this memory-authoritative prototype.

Rollback: freeze traffic and preserve failed-state logs; redeploy prior artifact only if schema compatibility is verified. Otherwise restore the backup to a **new** volume, validate data/profile references and replay, switch configuration, then resume. Never overwrite the only backup or recursively delete a volume as a default recovery action. Recovered rooms get a new epoch and paused playback. Rehearse restore in P6; recovery time/loss objectives remain OQ-09 rather than invented SLAs.

## Troubleshooting

| Symptom | Check / action |
| --- | --- |
| Transactions unsupported | MongoDB must be initialized replica set, URI must select correct replica set; inspect health |
| 401 / refresh loop | JWT issuer/audience/clock, cookie Secure vs loopback scheme, exact Origin; serialize refresh requests |
| Socket connects but no state | Verify token, membership/subscription ack and epoch; inspect rejected room authorization |
| Audio silent | Browser user gesture, asset MIME/Range, authenticated media fetch; banter is intentionally text |
| Queue frozen | Host disconnected or persistence degraded; reconnect Host or repair writer, then resync |
| No compatible segue | Inspect both BPM multiplier and Camelot relation; do not widen tolerance beyond hard bound |
| AI slow/unavailable | Warm model, inspect deadline and hardware; display template mode and measure fallback separately |
| Recommendation list short | Insufficient unseen catalog/interactions; do not fabricate five items or Precision@5 |
| Summary pending | End-session buffer not durably flushed; repair DB, retry finalization, compare watermark |
| API/queue latency high | Check event-loop CPU work, worker isolation, DB batch lag and slow client buffers; measure before adding infrastructure |

Maintain setup notes with actual runtime/package/model versions and commands after implementation. This document is a plan, not an installation test report.

## Phase 4 upgrade

Migration 004 adds chat projections and indexes. Before applying it to an existing library, stop writers and take/verify a private backup. Run the existing migration command only against the intended database; see [Phase 4 rollout and rollback compatibility](PHASE_FOUR_IMPLEMENTATION.md#persistence-and-rollout). This implementation task migrated only disposable test databases. The browser harness now allocates its own API/Vite ports, so it can run alongside a local app.
