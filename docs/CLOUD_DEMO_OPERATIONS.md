# On-demand hosted demo

Open **https://ai-dj-studio-ten.vercel.app**. Vercel serves the frontend and proxies API/Socket.IO requests to one Google Cloud VM inside Firebase project `ai-dj-studio-ravadakaran-4cf97`. It is a private demonstration deployment, not Firebase Hosting or a Firestore/Auth migration. There is no Spotify integration, public streaming or hosted model service. The direct VM URL returns 403.

Current frontend deployment: `dpl_LaZAFzw4iwDQyFd6npi6dY8SuZuj`, READY production, built locally with polling fallback. Only three public build files and static deployment configuration were uploaded; no secrets/database/audio. Production route version: `100d4d37-2dd8-4052-8193-430d5282407f`. Backend route `55789a87-0f14-43d2-a3bf-f1537644eb5e` targets `https://34.44.225.102/$1`. Browser polling route `c8bb5e51-32f2-4231-ab4f-89cb8e3c663e` targets `https://34.44.225.102/socket.io$1`; it applies only to GET with same-origin Fetch Metadata and no Origin, then supplies the canonical Origin. Explicit/wrong origins are preserved. Highest-priority canonical redirect `eae8f8eb-8e8e-4b99-90e0-bcd17b0f18e2` sends other deployment/project aliases to the canonical Vercel host, preserving the one configured Origin. No Git commit/push occurred.

## Open, start and stop

From this repository in PowerShell:

```powershell
.\scripts\cloud-demo.ps1 -Action Status
.\scripts\cloud-demo.ps1 -Action Start
.\scripts\cloud-demo.ps1 -Action Stop
```

`Status` and `Start` print the canonical Vercel URL and current backend origin. **A changed VM IP requires updating and promoting both Vercel backend routes before the app works again.** Using connected Vercel tools, edit the two route IDs above to the new HTTPS origin, preserving their distinct captures, conditions, GET restriction, secret and no-store transforms; then promote the final staged version. Never print/replace the secret for an address update. This synchronization is not automated by the PowerShell script. Allow a few minutes for boot and certificate issuance. Start refuses without cloud-enforced 5,400-second STOP. Starting an already running VM does not reset its allowance.

The operator login is saved locally at `%LOCALAPPDATA%\ai-dj-tools\demo-login.json`, outside Git. It contains the app login, not Google credentials. Keep it private. All normal registered-user/room roles remain enforced. The Google Cloud CLI uses a separate configuration at `%LOCALAPPDATA%\ai-dj-tools\gcloud-config`; do not copy it to the VM or repository.

Application access is limited to the operator's current public IPv4. To deliberately replace that allowlist after changing networks, with the VM running:

```powershell
.\scripts\cloud-demo.ps1 -Action AllowClient -ClientIPv4 YOUR_PUBLIC_IPV4
```

This replaces the address in the private local/VM edge configuration and restarts Caddy. SSH uses Google IAP. Ports 3000 and 27017 are not exposed. Port 443 admits Vercel's edge connections; Caddy requires the server-side origin secret plus Vercel's authenticated forwarded operator IP. Visitors cannot choose the origin-secret header because the Vercel transform replaces it. Direct requests without the secret are denied even with spoofed forwarded headers. Port 80 is open for ACME validation/redirects. Vercel's frontend is public static code; auth, catalog and audio remain behind the gate and application authentication. Private responses use no-store headers.

## Demo music and AI

Select **Hydrogen** as the starting track, then Rubidium and Caesium for the licensed demo chain. They are original publisher CC0 recordings from the pinned `everythingisfree` source already documented in [the provenance manifest](../evidence/acceptance-legal-media.json). The importer checks license, metadata and audio hashes; files remain behind authenticated media routes. Neutral energy/valence are explicitly authored demo values. Metadata-only seed fixtures remain unplayable and are not songs.

The private local database/library was not transferred. No generated or synthesized audio is included. Ollama is disabled on this small VM, so grounded text uses the existing labelled template fallback; this is not evidence of a cloud LLM passing evaluation. Existing independent sentiment/model/performance acceptance limitations remain.

## Resources and cost boundary

One `e2-micro` VM, `ai-dj-demo`, in `us-central1-a`; one retained 30 GB `pd-standard` boot disk; ephemeral IPv4; no service account, static IP, NAT gateway, load balancer or paid domain. A cloud STOP limit applies 90 minutes after instance start; a guest systemd timer is a second safeguard. Stop manually when finished. The disk/data survives stopping and can continue to incur charges if free-tier allowances do not apply.

The user selected demo-only use and a budget treated as ₹250/month. Eligible US e2-micro/standard disk allowances can reduce cost; IPv4, egress, taxes and existing account usage still matter. This is a budget target, not an enforced monthly cap. No 50-user capacity or cloud latency target is certified on this machine.

## Runtime and maintenance

Initial verified runtime: Ubuntu 24.04 with maintained GA `6.8.0-147-generic`, Node `24.22.2`, MongoDB `8.0.34`, Caddy `2.11.7`. The initial GCP `7.0.0` kernel was rejected by MongoDB's compatibility guard. `demo-kernel.sh` selects the newest installed GA 6.8 kernel on each grub update and uses its initramfs; it does not bypass MongoDB's guard. Keep Ubuntu GA security updates installed.

Cold-start recovery on 29 October: the 1 GB machine stalled before userspace with its 74 MB initramfs. Disabling Secure Boot alone did not recover it; a temporary 2 GB diagnostic boot succeeded. Rebuilding on the target with `/etc/initramfs-tools/conf.d/ai-dj-small-vm` containing `MODULES=dep` reduced the image to 20 MB. This setting detects the target's drivers, so regenerate the image before moving to different virtual hardware. Final 1 GB cold-start verification is recorded in implementation status. The diagnostic size is temporary, not approval for continuous larger-machine charges.

MongoDB is an authenticated loopback replica set with a 0.25 GB WiredTiger cache; the app uses the existing pooled connection and single process. A 2 GB swap file supports the constrained machine, without establishing capacity. Secrets are generated only on the VM under `/etc/ai-dj`, protected by file ownership/modes; the app receives only its database user and signing key.

`demo-origin.py` runs before Node/Caddy at boot to refresh the backend address, while `/etc/ai-dj/vercel-edge.json` preserves the canonical Vercel app origin, secret and operator IP. The matching private local file is `%LOCALAPPDATA%/ai-dj-tools/vercel-edge.json`; never commit or print it. Caddy obtains a short-lived public IP certificate and proxies gated API/socket requests to loopback Node. Vercel serves static files directly. Strict secure cookies and original browser Origin remain intact. External rewrite WebSocket upgrades returned 400; the frontend starts with Socket.IO HTTP polling and can upgrade where supported. No additional stateful application instance is created.

Use [the private deployment runbook](PRIVATE_DEPLOYMENT.md) before changing an existing release or restoring data. This installation is additive; no old library/database was reset. Retain the matching runtime release, environment and verified offline backup before future migrations. Backups/restore on this target and large-user/long-duration cloud load are not certified by the smoke checks.

Live verification commands (creates labelled fixture accounts and ends its fixture lounge):

```powershell
$env:DEMO_ORIGIN = 'https://ai-dj-studio-ten.vercel.app'
$env:DEMO_TRANSPORT = 'polling'
node scripts/verify-cloud-demo.js
node scripts/verify-cloud-media.js "$env:LOCALAPPDATA\ai-dj-tools\demo-login.json"
node scripts/verify-cloud-browser.js "$env:LOCALAPPDATA\ai-dj-tools\demo-login.json"
```

These verify HTTPS/readiness, cookies/Origin, HTTP/socket roles, concurrent retry deduplication, reconnect/end, licensed file hashes and authenticated range reads. HTTP media verification does not certify browser sound output, full-song playback, large-room latency or LLM quality.
