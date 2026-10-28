# Private single-instance deployment runbook

Target: one private Linux host with an operator-installed supported Node 24 runtime, Caddy, authenticated MongoDB replica set and durable asset storage. These templates are not a tested cloud deployment. Restrict inbound access to the intended VPN/private users; do not expose MongoDB, Node port 3000 or Ollama. Select/pin OS and infrastructure versions on the target; retain their actual versions in deployment evidence.

1. Stop the previous application and prevent every external writer/importer. Preserve the current release, private environment configuration and a verified backup. Run backup as the service account or protect its directory with equivalent owner-only permissions/Windows ACLs.
2. From the checked-out application release, run `npm ci`, `npm run lint`, `npm test`, `npm run build`. Node serves the built client plus API/socket on port 3000; Vite is development-only. Do not run clustering or multiple replicas.
3. Provision `/var/lib/ai-dj/assets` owned by the `ai-dj` account and a database user restricted to the application database. Keep MongoDB replication/authentication/keyfile management in the operator's infrastructure configuration. Do not reuse development Compose unauthenticated settings.
4. Write `/etc/ai-dj/environment` with owner-only permissions: `NODE_ENV=production`, `PORT=3000`, `APP_ORIGIN=https://YOUR_PRIVATE_HOST`, `COOKIE_SECURE=true`, `TRUST_LOOPBACK_PROXY=true`, absolute `ASSET_ROOT=/var/lib/ai-dj/assets`, private `MONGODB_URI`, a generated `JWT_SIGNING_KEY` (48+ characters), issuer/audience. Keep the exact same key for an immediate compatible recovery, or deliberately rotate it and require reauthentication. Do not enable AI metadata approval without satisfying its separate gates.
5. Run `npm run db:migrate` and `npm run db:seed` with that environment loaded against the intended database. Migration checksums and runner lock must pass; never edit migration files or clear a lock without confirming the prior runner stopped. Phase 6 adds no migration.
6. Adapt `deploy/ai-dj.service` paths and Node executable for the host, install it as the single service, and start it. Set `DJ_HOST` for Caddy, validate its config, then install `deploy/Caddyfile`. Caddy automatically handles supported TLS provisioning and WebSocket upgrade; operator DNS/certificates/private CA trust must be configured for the chosen host. Never claim successful TLS until a browser verifies it.
7. Check `/api/v1/health/live` = 200 and `/api/v1/health/ready` = 200. Readiness requires DB ping, readable/writable assets and healthy batch writer. Verify HTTP client addresses/rate limits through the proxy and exact HTTPS Origin/cookies; Node is loopback-only. Use two disposable browser accounts for the full journey. Record build, runtime, hardware, network, certificate and failures.
8. Exercise SIGTERM, await process exit and verify flush, restart, new epoch/paused state and Host reauthentication/resume. A 60-second service timeout is a ceiling, not a guaranteed flush; investigate shutdown failures before rollout.

## Offline backup and restore

This application's logical backup is independently executable without Database Tools. It includes private user/session/chat data: never commit a real backup or use `evidence/` as its destination.

```powershell
# Stop all writers; create parent directory beforehand. Directory must not exist.
$env:BACKUP_WRITERS_STOPPED='true'
npm run backup -- backup D:\private-backups\release-2026-10-28
Remove-Item Env:BACKUP_WRITERS_STOPPED
```

Retain `manifest.json`, all JSONL collections, `assets/`, release/lockfile and private environment configuration together in access-controlled storage. Verify the backup by restoring it; copying files alone is not a rehearsal. The production alternative is MongoDB's own tools under their documented version/consistency rules, but that path was not executed here.

For restore, create a separate environment file pointing to a **new empty database** and **new empty asset directory**. No app may run against either source or target during this operation. Load that environment instead of the normal `.env` (the CLI honors preexisting environment values), set `BACKUP_WRITERS_STOPPED=true`, then run `npm run backup -- restore D:\private-backups\release-2026-10-28`. Remove the flag afterward. The tool refuses nonempty targets and never drops data. On partial failure, retain diagnostics privately and use another empty target; do not reuse the partial target.

Verify collection counts/indexes/validators, asset hashes, migration checksums, and recovery to new epochs/paused playback. Check session-summary/history counts, own-history authorization and a two-user resync. TTL-expired sessions will require login. Repoint the single service only after this evidence is reviewed.

## Rollback

Stop the service and proxy access. For a compatible code-only Phase 6 rollback, restore the prior release/lockfile and private environment while keeping one instance; this phase introduces no storage migration. Rollback to binaries predating newer event types requires restoring a matching pre-change database and assets into separate empty targets. Do not point old reducers at unsupported new events. Validate readiness, epoch reset, auth, media containment and two-session behavior before reopening private access. Preserve the failed release and backup for investigation; do not reset the private database.

Official references verified 28 October 2026: [Caddy reverse proxy/WebSocket](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [MongoDB restore compatibility and archive options](https://www.mongodb.com/docs/database-tools/mongorestore/). These explain infrastructure capabilities, not evidence that this host has been deployed.
