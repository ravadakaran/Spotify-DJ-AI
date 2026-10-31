# Vercel frontend and one Google Cloud VM

**Current integration supersedes the historical preparation below:** the complete app is now served at `https://ai-dj-studio-ten.vercel.app`. Vercel serves static files and proxies `/api` and `/socket.io` through a protected Caddy origin gate to the one VM. The former VM-as-browser-origin topology is no longer active. See [current operations, verification and restart limitations](CLOUD_DEMO_OPERATIONS.md). Historical billing/provisioning blockers below are resolved.

Current deployment target after the user's account correction: Firebase/Google Cloud project **`ai-dj-studio-ravadakaran-4cf97`**, project number `839337670187`, signed-in account `ravadakaran743@gmail.com`. CLI returned this project as ACTIVE with Firebase enabled. The earlier project `ai-dj-studio-ravadakaran` remains untouched under the previous account context. Historical failures below describe that earlier project. Billing, VM and final-origin validation are still pending.

Latest verified blocker: Google Cloud CLI authentication now works, but the project API returns `billingEnabled:false`; the one visible billing account (“My Billing Account”) returns `open:false`. The user must reopen/replace that billing account and link an active account to this specific project. No Compute instance/disk/address/firewall has been created. The CLI is available at `%LOCALAPPDATA%/ai-dj-tools/gcloud-584.0.0/google-cloud-sdk/bin/gcloud.cmd`; set `CLOUDSDK_CONFIG=%LOCALAPPDATA%/ai-dj-tools/gcloud-config` to use this task's separate authenticated configuration. Never copy its credential files into the repository or VM.

29 October 2026: user authorized this hosting layout and requested a new cloud project. Configuration is prepared; a working full application deployment is not established. Google login succeeded and Google Cloud project `ai-dj-studio-ravadakaran` was created; Firebase enablement returned 403 twice. Vercel project `ai-dj-studio` exists and the initial frontend deployment has been started with protection retained. Google billing, VM size/region, domain and private access mechanism remain unconfigured. Google Compute Engine is a Google Cloud service, not Firebase Hosting. Firebase Auth, Firestore and Storage are not application dependencies and have not been introduced.

## On-demand budget scope — 29 October 2026

User gave a monthly budget of 250 in response to a rupee-denominated example (treated as ₹250/month) and explicitly selected “Run only for demos.” Do not provision a continuously running paid VM. Proposed demo configuration is one free-tier-eligible `e2-micro` in an eligible US region with at most 30 GB standard persistent disk, subject to verified account eligibility and existing usage. Its 1 GB RAM has not been validated for the combined app/MongoDB workload; do not claim existing Windows benchmark results transfer to it. Keep Ollama disabled.

Use an ephemeral external IP only while running; never reserve a static IP. No NAT gateway, load balancer or paid domain is authorized by this budget. Stopped VMs release ephemeral IPs, so the application address/access plan must accommodate changed addresses. A suitable private HTTPS hostname and certificate/access design remain open; provisioning alone will not make the frontend URL functional.

Install `deploy/ai-dj-demo-stop.service` and `.timer` into `/etc/systemd/system/`, run `systemctl daemon-reload` and `systemctl enable --now ai-dj-demo-stop.timer`. The timer requests normal VM shutdown approximately 90 minutes after **boot**, including provisioning time. If first enabled after 90 minutes uptime, it can fire immediately. Verify `systemctl list-timers ai-dj-demo-stop.timer` before a demo. Check service shutdown/flush and actual Compute Engine TERMINATED state afterward. Stop manually when finished; do not rely solely on the timer. No running VM currently has this timer installed.

This is a spending-reduction measure, not a guaranteed ₹250 hard cap. Free-tier compute/disk/egress eligibility is account-dependent, IP/egress charges can apply and storage survives shutdown. Google lists standard VM external IPv4 at US$0.005/hour (approximately US$3.65 for 730 running hours before the one free hour), excluding other resources/taxes/local-currency rates. Billing alerts do not enforce a spending cap. Do not proceed if account eligibility or projected total exceeds the budget. [Free-tier limits](https://docs.cloud.google.com/free/docs/free-cloud-features), [network pricing](https://cloud.google.com/vpc/network-pricing), [stop behavior](https://docs.cloud.google.com/compute/docs/instances/stop-start-instance).

## Routing

Initial Vercel frontend deployment is READY at [the pinned deployment](https://ai-dj-studio-5bd55o3r4-ravadakarans-projects.vercel.app), production target, remote commit `52213db`. Deployment protection remains enabled, so it is not yet a configured Caddy static upstream. The assigned alias is [ai-dj-studio-ten.vercel.app](https://ai-dj-studio-ten.vercel.app). No functioning backend is attached.

Users open one HTTPS origin at the VM's Caddy edge. `/api`, `/api/*`, `/socket.io` and `/socket.io/*` go directly to the existing loopback Node process. Other GET/HEAD requests fetch the static frontend from a pinned Vercel deployment. Static requests strip application cookies and Authorization; other methods receive 405. All authenticated media stays on the VM behind the existing API.

This preserves relative client URLs, strict refresh cookies, exact Origin/CSRF validation, socket events and one room authority. No CORS relaxation, auth rewrite, schema, migration or queue change is needed. The Vercel address is a static origin, not the complete app URL: login and sockets do not work there. This topology adds a VM-to-Vercel request hop and keeps the VM in the frontend availability path. It prioritizes compatibility over direct CDN delivery to users.

Keep one Node process; no autoscaling, clustering, rolling overlap or second active release. MongoDB remains an authenticated replica set with one pooled application client. Use durable VM storage for MongoDB and assets; do not use Local SSD for persistent data. Keep the local LLM disabled until separately configured and approved. Do not upload the existing private database, chat, credentials or unverified local catalog.

## Vercel

1. Import `ravadakaran/Spotify-DJ-AI` into the intended Vercel team after team consent succeeds. Use repository root, Node 24.x, `npm ci`, `npm run build`, and `client/dist`. Root `vercel.json` records build/output settings. Do not set `server` as a function entry point.
2. Deploy the reviewed local changes only after they are available to the chosen deployment source. Never claim remote Git contains uncommitted local configuration. `.vercelignore` excludes private files from CLI uploads; it is not a substitute for checking Git history or an assurance that tracked files are hidden from Git builds.
3. Copy the immutable deployment hostname into `VERCEL_FRONTEND_HOST` for Caddy. Fetch `/` and its JS/CSS before activation. Protected Vercel deployments will return a login page to Caddy unless an approved access mechanism is configured. Do not embed bypass tokens in this repository. A public static frontend can be used only after its visibility is deliberately selected; it contains no catalog or authenticated backend data.

## New Firebase/Google Cloud project and VM

1. Continue with the existing Firebase-enabled project `ai-dj-studio-ravadakaran-4cf97`, using `ravadakaran743@gmail.com`; do not create it again or attempt to enable the earlier account's project. Billing linkage and Compute Engine access must be configured before creating paid resources. Do not enable unrelated Firebase services. [Project billing settings](https://console.cloud.google.com/billing/linkedaccount?project=ai-dj-studio-ravadakaran-4cf97).
2. Select region and VM size against budget and expected users; no capacity estimate has been benchmarked on this host. Reserve an address, configure the chosen DNS hostname and restrict app access to the intended VPN/private users. Restrict SSH to the operator and keep ports 3000, 27017 and 11434 private. TLS issuance must match that access design.
3. Provision one Linux VM with supported Node 24, Caddy and an authenticated MongoDB replica set. Use durable storage mounted for `/var/lib/ai-dj/assets` and MongoDB data, with snapshots/backups retained separately. Disabling disk auto-deletion is an operator provisioning decision, not provided automatically by these files.
4. Follow [private deployment](PRIVATE_DEPLOYMENT.md) for service user, file ownership, database credentials, backup, migration/seed and systemd. Use `deploy/production.env.example` as a reference for `/etc/ai-dj/environment`. Generate a private signing key; replace all placeholders. Load the same environment for CLI migrations and the service. Do not run against the existing private development database.
5. Use `deploy/Caddyfile.vercel` instead of `deploy/Caddyfile`. Set `DJ_HOST` and `VERCEL_FRONTEND_HOST` in the **Caddy service environment**, not only the Node service environment. Set Node `APP_ORIGIN=https://DJ_HOST`. Validate with `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` using the actual Caddy environment before reload. Start only the single `ai-dj.service`.

## Activation, verification and rollback

Before activation: lint/build, validate the actual Caddy configuration, confirm no placeholders, verify static upstream content/protection and private access/firewalls, back up existing data if any, then migrate/seed only the selected new database. Keep a matching frontend/backend release; do not auto-promote frontend changes independently of backend compatibility.

On the final HTTPS origin check `/api/v1/health/live` and `/api/v1/health/ready`, secure cookie login → refresh → logout, wrong-Origin/CSRF denial, two-user create/join/snapshot/vote/chat, WebSocket reconnect/new epoch after restart, authenticated media/range loading and anonymous denial, role denial and session end. Confirm private cookies/Authorization are absent at the static upstream. Record actual hardware, release, TLS, timing and failures. Existing local regression results do not certify cloud routing, TLS or latency.

For rollback, stop Node and preserve a backup; restore a compatible backend release and pinned Vercel deployment hostname together, validate Caddy, then restart the single service. Use the existing offline backup/restore procedure for incompatible persisted events. Do not delete the cloud project or reset existing data as a rollback shortcut.

## Official sources checked 29 October 2026

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json): root build/output configuration.
- [Vercel WebSockets](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections): supported, but future connections are not guaranteed to reach one function instance. This does not satisfy this app's in-memory authority.
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy): path routing, HTTPS upstream/Host and WebSocket proxy support.
- [Google Cloud disk types](https://docs.cloud.google.com/compute/docs/disks): persistent disk versus ephemeral Local SSD.
