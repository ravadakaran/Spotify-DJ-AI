# Free public portfolio demo

Status: repository configuration is prepared; Render/Atlas accounts, cluster,
deployment and public cutover are not yet verified. The existing Vercel URL
still uses the operator-restricted Google Cloud backend until cutover.

Latest provisioning: the user enabled Atlas AI-client access. Dedicated project
`AI DJ Public Demo` (`6ae35a9de34f277814f94b5f`) and Free AWS/Oregon cluster
`ai-dj-demo` exist; cluster inspection reports IDLE on MongoDB 8.0.34. Database
user creation was not executed because the integration's confirmation step
failed even after chat approval; the project currently has zero DB users and
no opened network access. Render access and deployment remain pending. Do not
create a duplicate project/cluster when resuming.

## Services and limits

- Vercel Hobby: existing static frontend and same-origin API/Socket.IO proxy.
- Render Free: exactly one Node process, no autoscaling or paid disk. Free
  services sleep after 15 idle minutes; waking takes about a minute. The UI
  retries readiness for up to 90 seconds. No keep-alive workaround is configured.
- Atlas Free: dedicated `ai_dj_public_demo` database; accounts and room events
  persist separately from Render's ephemeral filesystem.
- Three original-publisher CC0 tracks are pinned and hash-verified during build.
  Only authenticated media routes serve them. The public demo catalog is
  read-only, including for admins, because uploaded files would disappear.
- All visitors register their own ordinary account and use private invite-based
  lounges. Never publish an administrator password or share an admin session.
- AI text uses the existing labelled template fallback. No hosted LLM, Spotify
  integration, generated audio or cloud performance certification is included.

Free usage has provider quotas; this is a portfolio demonstration, not a
guarantee of unlimited bandwidth, immediate cold starts or continuous availability.

## Account-dependent activation

1. Sign into [Render](https://dashboard.render.com) and
   [MongoDB Atlas](https://cloud.mongodb.com) using your own account. Use the
   **Free** cluster/service tiers; do not select Flex, trials or paid disks.
2. Create a dedicated Atlas project/Free cluster. Create a database user with
   read/write and schema/index administration rights limited to
   `ai_dj_public_demo`. Allow the Render service's documented outbound IP ranges;
   do not open database network access to every address.
3. Import this repository as a Render Blueprint using `render.yaml`. If the
   deployment files are on a preparation branch, select that branch explicitly.
   Automatic deployment is disabled to avoid overlapping room authorities.
4. Put the Atlas SRV connection string directly into Render's private
   `MONGODB_URI` setting, selecting `/ai_dj_public_demo` as the database. Never
   paste it into chat or commit it. Set `JWT_SIGNING_KEY` to a newly generated
   private random value of at least 48 characters. Render's automatic 256-bit
   base64 generation is shorter than the app's existing string-length guard,
   so this variable is explicitly supplied rather than weakening the guard.
5. Deploy. Build downloads verify publisher license/metadata/audio hashes;
   startup claims singleton ownership, applies existing migrations and inserts
   missing demo tracks without resetting accounts or existing track metadata.
   No private VM database or local catalog is transferred.
6. Verify readiness on the assigned Render HTTPS URL. Update both existing
   Vercel backend route destinations from the VM IP to that actual hostname;
   preserve their distinct path captures, no-store rules and browser polling
   Origin normalization. Preserve the canonical-alias redirect. Render does
   not use the old operator-IP Caddy gate; app authentication remains mandatory
   for catalog, media, rooms and user data. Wrong explicit Origins remain denied.
7. Publish the matching built frontend with its cold-start message. Run the
   HTTP/socket/media and real-browser checks below from a second network to
   verify public access. Only then mark the GitHub README link as publicly live.
8. Stop the old VM after cutover succeeds. Retain its data until backup/restore
   is verified and deletion is deliberately authorized. A retained disk can
   still incur charges if its free allowance does not apply; migration alone
   does not delete billable resources.

## Deployments, crashes and recovery

The app's room authority must never run in overlapping instances. Render's
rolling deployments can overlap even with a nominal instance count of one.
`deployment_locks` therefore holds one non-expiring record with ID
`public-demo-runtime` and a random owner. Only that owner can release it after
the application closes and flushes. A second instance fails startup rather
than serving another authority. Do not delete this record while any old
process could still run. There is no timeout-based takeover or exactly-once claim.

Normal SIGTERM shutdown releases ownership. A killed process, failed flush or
interrupted bootstrap can leave the guard in place and require operator
recovery. Before upgrades, end active lounges and stop/suspend the old service;
confirm the old process is terminated, back up the database, and recover any
stale ownership record only after that confirmation. Do not use automatic
rolling deploys or restart a second service against this database. Provider
maintenance may cause interrupted sessions or failed replacement startups;
the guard prioritizes one authority over uninterrupted availability.

No new versioned user/event migration is introduced. `deployment_locks` is a
bounded deployment-control collection with one ownership record; its built-in
unique `_id` prevents duplicate owners. Existing migrations/validators remain
unchanged and must pass on the target Atlas cluster before cutover.

## Verification

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
$env:DEMO_ORIGIN = 'https://ai-dj-studio-ten.vercel.app'
$env:DEMO_TRANSPORT = 'polling'
node scripts/verify-cloud-demo.js
```

Create an ordinary visitor login and save it in a private JSON file outside
Git with `email` and `password` fields. Use that file for:

```powershell
node scripts/verify-cloud-media.js PRIVATE_LOGIN_FILE
node scripts/verify-cloud-browser.js PRIVATE_LOGIN_FILE
```

Also verify cold wake after actual idle sleep, return after redeployment,
non-operator access, wrong-Origin/HTTP/socket role denials and persistent data.
Local tests do not certify Atlas access or a live Render deployment.

## Official references checked 29 October 2026

- [Render Free limitations](https://render.com/docs/free)
- [Blueprint schema](https://render.com/docs/blueprint-spec)
- [Render port binding](https://render.com/docs/web-services#port-binding)
- [Render deployment overlap](https://render.com/docs/deploys)
- [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Atlas command compatibility](https://www.mongodb.com/docs/atlas/unsupported-commands/)
