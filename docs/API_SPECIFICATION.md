# API specification

Prepared public demo: optional `DEMO_READ_ONLY_CATALOG=true` rejects authenticated mutations below `/assets` and `/tracks` with HTTP 403 / `DEMO_CATALOG_READ_ONLY`, including admin writes. Anonymous requests remain 401; room creation and personal/social operations remain supported. Default deployments preserve all catalog APIs. No route/event name or core payload changed. The existing `/health/ready` endpoint supports browser cold-wake retries for up to 90 seconds. Render/Atlas public cutover remains pending. [Setup](PUBLIC_DEMO_SETUP.md).

29 October 2026 final hosting preserves all API/socket names, examples and role rules. The user-facing origin is `https://ai-dj-studio-ten.vercel.app`; Vercel proxies `/api` and `/socket.io` with the original browser Origin. Secure/strict refresh cookies remain on the Vercel host. Socket.IO uses HTTP polling when the edge rejects upgrades; server authority and socket event envelopes are unchanged. Direct VM requests are denied by the authenticated edge gate. No new application endpoint or browser CORS exception was added. [Routing contract](CLOUD_DEMO_OPERATIONS.md).

28 October 2026 IMP-002 adds admin `PUT /tracks/:id` (complete title/artist/acoustic/timeline/asset edit with expectedProfileVersion) and `DELETE /tracks/:id` (expectedProfileVersion). Both require all lounges ended; replacement uses existing POST /assets, derives duration and clears the prior timeline. Responses include assetCleanup. Existing examples and socket events remain supported. [Payloads, errors and cleanup](CATALOG_MANAGEMENT.md).

28 October 2026 frontend redesign changes no endpoint, request payload, mandatory example or socket event name. Play/Pause and Like/Liked use existing commands. [Frontend compatibility](FRONTEND_REDESIGN.md).

Phase 6 preserves all HTTP examples and socket event names. Health routes are `/api/v1/health/live` and `/api/v1/health/ready`. `TRUST_LOOPBACK_PROXY=true` enables loopback-only forwarded HTTP client addresses. Socket transport handshake allowance is bounded at 120/minute per peer; slow transports exceeding 20 queued packets are disconnected and must resync. No operational backup API is exposed. [Contracts and limitations](PHASE_SIX_IMPLEMENTATION.md).

Phase 5 implements interaction PUT, dashboard/recommendations, paginated own lounges, own-session analytics and admin job POST/GET. Socket commands add interaction.record and Host-only room.end. End returns synchronous 200 with acknowledgement and summaryStatus:complete after the flush barrier, replacing the planned 202. Analytics returns 202 while unavailable. Dashboard/recommendation reads declare durability/cutoff and bounded scope. [Exact definitions and limitations](PHASE_FIVE_IMPLEMENTATION.md).


Phase 4 routes below are now implemented for chat/history/reactions and battles. Socket `lounge.command` types: chat.message `{body}`, chat.reaction `{messageId,emoji,active}`, battle.candidate `{trackId}`, battle.open `{battleId,expectedRevision,durationSeconds}`, battle.vote `{battleId,candidateId}`, battle.resolve `{battleId,expectedRevision,winnerCandidateId?}`, battle.cancel `{battleId,expectedRevision}`. HTTP path IDs are server-injected into these schemas. Send `lounge.chat.typing` with `{active}`; server broadcasts `{loungeId,payload:{userId,active,expiresAt}}`. Chat/history GET uses messageId cursor and up to 50 messages; responses are oldest-to-newest within each page. Mutation responses are revision acknowledgements (plus message/candidate IDs where applicable), followed by one authoritative snapshot; they are not partial state to merge. Existing lounge.chat.*, lounge.sentiment.score and lounge.soundclash.* notification names are preserved. Reaction notifications include messageId, emoji, count, complete reactions and revision; battle notifications include the full bounded battle. [Details and limitations](PHASE_FOUR_IMPLEMENTATION.md).


## Phase 3 implemented contract

POST `ai/segue`, `ai/segue/:proposalId/decision` and `ai/questions` under `/lounges/:id` are implemented, as are socket commands `ai.segue`, `ai.decision`, `ai.question`. Host/Co-DJ may propose/decide; members may ask about current/five recent tracks. All return revision acknowledgements. Propose accepts only `{expectedRevision}` and returns `{...ack,proposal}`. Decide accepts `{expectedRevision,decision:"approve"|"reject"}` (socket also includes proposalId). Questions accept `{trackId,question}` and return answer/citations/mode fields with the ack. Approval reserves next; explicit Advance checks compatibility again. The original source examples below are preserved; their client-supplied time/candidate/sentiment assertions are superseded by server-owned context and unknown fields now return 422. This avoids trusting client context or adding redundant assertion fields. Full payloads, errors, retries and bounds: [Phase 3](PHASE_THREE_IMPLEMENTATION.md). New runnable examples: [phase-three.http](../examples/phase-three.http).

## Phase 2 implemented contract

Queue enqueue/remove/vote/promote, playback control, settings, invite rotation, membership patch, host-transfer and leave now use one room authority over both HTTP and `lounge.command`. Every command accepts UUID `X-Command-Id` (socket `commandId`); clients should preserve it on retry. The latest 256 live-room receipts are retained. Structural commands require `expectedRevision`; votes and leave do not. Success returns `{ok:true,epoch,revision,durableRevision}` with `entryId` on enqueue, or `inviteCode,expiresAt` on rotation. Enqueue/rotation use 201; other implemented commands, including leave, use 200. This supersedes the planned snapshot/204 responses in the original table: the user's Phase 2 request explicitly requires revision acknowledgements. Fetch `GET /lounges/:id` or apply the socket snapshot for state.

`queue.promote` reserves immediate next without changing sorted Next Up. Manual `advance` selects the reservation or first ordered entry and rechecks current BPM/Camelot profiles; incompatible or missing profiles return 409 `INCOMPATIBLE_TRACK`. Initial start requires a local audio asset. Pause/resume preserves server time; end-of-track pauses pending explicit advance. Host loss returns 409 `HOST_DISCONNECTED`; persistence failure/capacity returns 503. Stale revision and conflicting reused command IDs return 409. Removal detaches all target room subscriptions. Leave preserves membership for rejoin. Muting persists the flag; chat/reactions remain Phase 4 endpoints.

Subscribe/resync acknowledgements additionally contain `snapshot`. Full snapshots include `serverTime`, `presentUserIds`, `participantCount`, `hostConnected`, `mutationFrozen`, `degraded`, `recovery`, sorted `nextUp`, and `reservedEntryId`. Transport notification events remain hints; only snapshots replace client state. Snapshots use eventSeq 0 and are coalesced per event-loop turn; a gap invokes resync. Ping/pong uses the server's monotonic-anchored timestamp. Full behavioral/retention limits: [Phase 2 implementation](PHASE_TWO_IMPLEMENTATION.md).

Phase 1 runnable examples: [foundation.http](../examples/foundation.http). Asset upload accepts content-validated WAV, MP3 and audio-only MP4 (served as `audio/mp4`). Imported catalog entries expose `profileStatus: pending` and null `acoustic`; profile PUT transitions to ready. Lounge POST supports UUID `X-Command-Id`: retries within the receipt retention window return the same lounge/invite; a different body under that ID returns 409. Snapshot fields reflect current state on retry. Other future queue command contracts below remain planned.

Target contract v1 with a partial foundation implemented. Base `/api/v1`, JSON UTF-8, UTC ISO-8601 dates, UUID identifiers (illustrative IDs below are shortened). JWT bearer authentication for protected REST endpoints. Socket handshake `auth.accessToken` contains the same JWT, never a query-string token. Refresh cookie is HttpOnly/Secure/SameSite=Strict (Secure off only for loopback development). No Spotify OAuth in this product.

Current routes: auth register/login/refresh/logout, users/me, users/me/lounges, track list/create/profile read/update, asset upload/content, lounge create/join/read, and health. Socket subscribe/resync/snapshot and sync ping are implemented; the browser uses WebSocket transport. All other routes/events below remain planned. `/users/me/lounges` currently returns up to 50 memberships without pagination; full cursor history is pending. Common X-Command-Id receipts and structural mutation revision guards are not implemented yet, except profile compare-and-swap; create retries can create another lounge. These are explicit partial-contract limitations, not completed guarantees. Lounge capacity currently reserves membership slots. Startup creates a new epoch; queue/playback recovery is not yet implemented.

## Shared conventions

All mutations accept `X-Command-Id: UUID`; retries reuse the ID and identical request body. Room mutation response includes `epoch`, `revision`, `durableRevision`; acknowledgement means accepted into memory, not durable. Bind deduplication to actor, lounge, command ID and payload hash; conflicting reuse returns 409. Maintain command receipts for room lifetime (bounded command budget), recover persisted receipts from events; crash may lose unflushed receipts, so clients must resync after epoch change and must not automatically replay old-epoch mutations.

Structural commands include `expectedRevision`; reject stale revision with 409. Votes/chat can omit expectedRevision and are serialized by identity/target; they must refer to active entries. One queue upvote per user/entry; PUT is idempotent. Server controls time, sentiment, tally, roles and order. All unknown fields rejected except explicitly versioned extension objects. Maximum JSON body 64 KiB; profile timeline limits in [schema](DATABASE_SCHEMA.md).

Errors: `{ "error": { "code":"STALE_REVISION", "message":"Refresh lounge state.", "details": {"currentRevision":13}, "requestId":"r-1" } }`. Never expose internal exception text. 400 malformed JSON/cursor, 401 absent/expired auth, 403 disallowed role/mute/lock, 404 missing or nonvisible resource, 409 stale/conflicting state/capacity, 413 too large, 422 valid JSON with invalid fields, 429 throttled with Retry-After, 503 dependency/persistence unavailable. Reads/updates return 200, creation 201, logout/deletes 204 unless specified; asynchronous jobs 202.

Lists use `?limit=20&cursor=opaque`, limit 1–100, stable `(createdAt,id)` ordering. Response `{items:[],nextCursor:null}`. Room snapshot is one bounded full object, not paginated. Search uses `?q=` max 100 characters. Never return another user's email or private history.

For live chat reads, merge durable history with the room's accepted pending messages by messageId so the one-second persistence interval does not make newly acknowledged messages disappear. Cursor pagination anchors at a server-issued upper timestamp/ID boundary; deduplicate pending and durable rows. Session-history and recommendation reads may lag persistence and expose their `asOf` watermark. They must never pretend to include unflushed events.

## Routes

Role abbreviations: U authenticated user; M current room member; H Host; D Co-DJ; A global Admin. H/D require membership in that exact lounge. Operators have no implicit room access.

| Method/path | Auth | Request → result |
| --- | --- | --- |
| POST `/auth/register` | Public, throttled | `{email,password,displayName}` →201 `{user:{id,displayName}}`; no role field |
| POST `/auth/login` | Public, throttled | `{email,password}` →200 `{accessToken,expiresIn:900,user}` plus refresh cookie |
| POST `/auth/refresh` | Refresh cookie + Origin/CSRF | Empty →200 rotated cookie and `{accessToken,expiresIn:900}` |
| POST `/auth/logout` | Refresh cookie + Origin/CSRF | Empty →204 revoke family and clear cookie |
| GET `/users/me` | U | →200 own identity and admin flag |
| GET `/tracks` | U | Search/cursor →200 catalog page |
| POST `/assets` | A | Multipart `file,licenseLabel,sourceAttribution` →201 `{assetId,mimeType,durationSeconds}` |
| GET `/assets/{id}/content` | U | Authenticated media response, Range supported; 200/206, invalid range 416 |
| POST `/tracks` | A | `{title,artist,durationSeconds,assetId,acoustic,timeline}` →201 track/profileVersion |
| GET `/tracks/{id}/acoustic-profile` | U | →200 profile example below |
| PUT `/tracks/{id}/acoustic-profile` | A | `{expectedProfileVersion,acoustic,timeline}` →200 versioned profile; conflict 409 |
| POST `/lounges` | U, becomes H | Creation example below →201 lounge + inviteCode (shown to creator only) |
| GET `/lounges/{id}` | M | →200 authoritative snapshot |
| POST `/lounges/join` | U | `{inviteCode}` →200 snapshot/membership; idempotent rejoin; locked/removed forbidden |
| POST `/lounges/{id}/leave` | M | Empty →204 detach current user's room sockets; Host follows freeze rule |
| PATCH `/lounges/{id}/settings` | H | `{expectedRevision,locked?,vibeProfile?,bpmTolerancePct?,soundclashEnabled?,aiVerbosity?}` →200 snapshot |
| POST `/lounges/{id}/invites/rotate` | H | `{expectedRevision}` →201 `{inviteCode,expiresAt}` invalidating old code |
| PATCH `/lounges/{id}/members/{userId}` | H | `{expectedRevision,muted?,removed?,role?:listener/co_dj}` →200 member; cannot demote self here |
| POST `/lounges/{id}/host-transfer` | H | `{expectedRevision,userId}` →200 snapshot; target active member, old Host becomes Co-DJ atomically |
| POST `/lounges/{id}/playback` | H/D | `{expectedRevision,action:start/pause/resume/advance}` →200 snapshot; advance requires approved eligible reservation |
| POST `/lounges/{id}/end` | H | `{expectedRevision}` →202 `{summaryStatus:pending}`; flush, then final state event |
| POST `/lounges/{id}/queue` | H/D | `{trackId,expectedRevision}` →201 `{entryId,...revisionFields}` |
| DELETE `/lounges/{id}/queue/{entryId}` | H/D | `{expectedRevision}` →200 snapshot; cannot remove Now Playing |
| PUT `/lounges/{id}/queue/{entryId}/vote` | M | `{upvoted:true/false}` →200 snapshot; one vote per user |
| POST `/lounges/{id}/queue/{entryId}/promote` | H/D | `{expectedRevision}` →200 eligible reservation or 409 incompatible |
| POST `/lounges/{id}/battles/candidates` | M | `{trackId}` →201 `{candidateId,battleId}` in draft stage |
| POST `/lounges/{id}/battles/{bid}/open` | H/D or Internal AI DJ | `{expectedRevision,durationSeconds}` →200 battle; 2–4 candidates, proposed 10–120 seconds; AI DJ opens autonomously when enabled |
| PUT `/lounges/{id}/battles/{bid}/vote` | M | `{candidateId}` →200 tally, replace user's prior vote; closed returns 409 |
| POST `/lounges/{id}/battles/{bid}/resolve` | H/D | `{expectedRevision,winnerCandidateId?}` →200 resolved/deferred result; manual selection only among tied highest votes |
| POST `/lounges/{id}/battles/{bid}/cancel` | H/D | `{expectedRevision}` →200 cancelled result |
| GET `/lounges/{id}/chat` | M | Cursor →200 message page |
| POST `/lounges/{id}/chat` | M, unmuted | `{body}` →201 `{messageId,sentimentBucket,...revisionFields}` |
| PUT `/lounges/{id}/chat/{mid}/reactions` | M, unmuted | `{emoji,active:boolean}` →200 reaction counts |
| POST `/lounges/{id}/ai/segue` | H/D | Segue example below →200 proposal, no implicit queue mutation |
| POST `/lounges/{id}/ai/segue/{proposalId}/decision` | H/D | `{expectedRevision,decision:approve/reject}` →200 snapshot; revalidate eligibility |
| POST `/lounges/{id}/ai/questions` | M | `{trackId,question}` →200 `{answer,sourceEvents,profileVersion,generationMode,insufficientMetadata}` |
| PUT `/lounges/{id}/playbacks/{playbackId}/interaction` | M | `{listenedThroughSeconds,liked}` →200 bounded server-derived interaction; userId from JWT |
| GET `/users/me/dashboard` | U | →200 `{history,tasteProfile,activeLounges}`; history separately cursor-addressable via `/users/me/lounges` |
| GET `/users/me/lounges` | U | Cursor →200 attended/hosted lounge page |
| GET `/users/me/recommendations` | U | `limit=5` (1–20) →200 `{items:[{trackId,score,reason}],modelVersion,fallbackReason}` |
| GET `/lounges/{id}/analytics` | Current/past member | →200 summary; pending returns 202 |
| POST `/admin/recommendation-jobs` | A | Empty →202 `{jobId,status}` |
| GET `/admin/recommendation-jobs/{jobId}` | A | →200 `{status,modelVersion,metrics?,failureReason?}` |
| GET `/health/live`, `/health/ready` | Public minimal | →200 `{status}` or 503; no internals |

Admin assets use approved audio MIME signatures, proposed 25 MiB cap, generated storage keys and path containment. Media URLs do not carry JWTs; fetch with Authorization and object URLs, or a narrowly scoped short-lived media ticket after a documented change. Live catalog playback must not depend on public object storage.

## Required PRD examples

`POST /lounges`:

```json
{"seedTrackId":"t_2001","vibeProfile":"High-Energy EDM","maxParticipants":40,"bpmTolerancePct":8,"soundclashEnabled":true,"aiVerbosity":"normal"}
```

201: `{ "loungeId":"lg_77120", "inviteCode":"generated-on-server", "status":"scheduled", "hostUserId":"u_501", "createdAt":"2026-10-18T06:00:00Z" }`. Positive finite BPM; maxParticipants 2–50; settings are validated before membership creation.

`GET /tracks/t_2001/acoustic-profile`:

```json
{"trackId":"t_2001","title":"Original Loop A","artist":"Demo Creator","profileVersion":1,"acoustic":{"bpm":120,"camelotKey":"8A","energy":0.6,"valence":0.65},"timeline":[{"id":"evt_1","ts":12,"type":"trivia","text":"Recorded for this demo.","sourceLabel":"Creator note"}]}
```

`POST /lounges/lg_77120/ai/segue`:

```json
{"currentTrackId":"t_2001","currentTs":198,"candidateTrackIds":["t_2002","t_2003"],"currentSentimentScore":0.72,"expectedRevision":12}
```

Preserve PRD example fields, but treat time/sentiment/candidates as assertions, not authority: compare with current server state, reject mismatch (409); candidates must exist in the lounge. Scheduler invokes the same service internally. Example 200:

```json
{"proposalId":"p_1","baseRevision":12,"selectedTrackId":"t_2002","matchReason":{"bpmDeltaPct":3.3333,"tempoMultiplier":1,"camelotRelation":"adjacent","energyFit":0.956},"transitionScript":"Next is Original Loop B, a compatible adjacent-key choice.","sourceEvents":[],"generationMode":"template","generatedAt":"2026-10-18T06:01:00Z"}
```

An acoustic-only template needs no lore citations; factual lore/Q&A must cite actual retrieved IDs. No eligible track returns 200 with null selectedTrackId and NO_COMPATIBLE_TRACK, rather than inventing a match. A provider timeout uses flagged template output; unavailable authoritative room state returns 503.

## Real-time contract

Namespace `/lounges`; server-controlled Socket.IO room `lounge:{id}`. Authenticate handshake, verify membership before subscription, recheck authorization on sensitive commands, disconnect at JWT expiry. Client obtains a fresh token and reconnects; unauthorized rooms are never joined based solely on a submitted ID.

Envelope extends PRD shape: `{event,loungeId,payload,ts,epoch,revision,eventSeq:0..N,commandId?}`. `ts` is server Unix milliseconds. Socket mutations use `lounge.command` with `{commandId,type,payload,expectedRevision?}`; command types map one-to-one to REST services (`queue.vote`, `chat.send`, `battle.vote`, `playback.control`, `member.update`, `segue.decide`). No alternative reducer. Acknowledgement `{ok:true,epoch,revision,durableRevision}` or `{ok:false,error}` follows the REST error codes.

| Event | Direction | Payload |
| --- | --- | --- |
| lounge.subscribe / lounge.resync | Client→server | `{loungeId,knownEpoch?,knownRevision?}` →ack + snapshot |
| lounge.state.snapshot | Server→client | Full `{status,hostConnected,nowPlaying,nextUp,battle,sentiment,members,durableRevision}` |
| lounge.queue.update | Server→client | `{queue:[{entryId,trackId,position,voteCount}],nowPlaying,reservation,reason:vote/segue/battle/manual}` |
| lounge.presence.update | Server→client | `{participantId,action:joined/left,participantCount}` |
| lounge.chat.message | Server→client | `{messageId,userId,body,msgType,sentimentBucket,tsSeconds}` |
| lounge.chat.typing | Both, throttled | `{userId,active}`; server supplies identity, expires after 3 s, not persisted |
| lounge.chat.reaction | Server→client | `{messageId,emoji,count}` |
| lounge.sentiment.score | Server→client | `{rollingScore,windowSeconds,sampleSize}` |
| lounge.soundclash.open | Server→client | `{battleId,candidateTrackIds,closesAt}` |
| lounge.soundclash.resolved | Server→client | `{battleId,winningTrackId,applicationStatus:reserved/deferred}` |
| lounge.soundclash.update | Server→client | `{battleId,status,candidates,voteCounts}` including tie/cancel |
| lounge.ai.dj_announcement | Server→client | `{text,relatedTrackId,sourceEvents,generationMode}` |
| lounge.ai.proposal | Server→client | Segue proposal with baseRevision |
| lounge.status.update | Server→client | `{status,hostConnected,mutationFrozen,summaryStatus}` |
| lounge.sync.ping / lounge.sync.pong | Client→server / server→client | `{clientSentAt,serverReceivedAt,serverSentAt}` for RTT/clock offset |

Publish one snapshot as the atomic room-state update; specialized events drive notifications/history and must not independently mutate queue order. All events from one command share its revision; each event carries a 0-indexed `eventSeq` within that revision (persisted under unique `(loungeId,epoch,revision,eventSeq)`), deduplicated by `(epoch,revision,eventSeq)`, while queue snapshot replacement ignores revisions ≤ current. Event gaps trigger resync. Slow clients receive disconnect/resync rather than unbounded outbound buffers. Chat pagination plus snapshot restores history after dropped delivery. Closed/removed membership immediately detaches its sockets. All these behaviors require tests; delivery is not presumed exactly once.

28 October 2026 enhancement: Track-picker enhancement retains existing GET /tracks, create, queue and battle contracts and socket names. Search is over the already loaded catalog page. [Scope and limitations](TRACK_SELECTION_ENHANCEMENT.md).

28 October 2026 automatic continuation: Natural completion automatically advances reserved entry or queue head when playable and compatible. Existing playback actions and snapshot/socket contracts are unchanged. [Behavior and validation](AUTOMATIC_QUEUE_CONTINUATION.md).

28 October 2026 listening-flow enhancement: Add GET /lounges/:id/compatibility?trackIds=<1–200 distinct comma-separated UUIDs> for current members, limited to 30 reads/minute per identity. Response includes epoch/revision/current track/profile version/tolerance and per-track profileVersion/acoustic/eligible/reasons. GET /tracks q now matches literal title OR artist with existing cursor semantics. Analytics adds optional bounded battle-result fields; socket names and mutation payloads remain unchanged. [Contracts, limits and actual validation](LISTENING_FLOW_IMPROVEMENTS.md).

28 October 2026 acceptance work: the Ollama adapter selects bounded aliases then maps them to captured versioned citations; actual real-model warm evaluation and failures are recorded in [acceptance closure](ACCEPTANCE_CLOSURE.md). Source selection remains constrained and does not change socket/API contracts.
