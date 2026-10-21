# Phase 2 implementation — 21 October 2026

TASK-009–013 implement the JavaScript/Express/Socket.IO/Mongoose live-room slice. The app remains one instance with one pooled MongoDB connection. No model, external music service or new dependency was added.

## Authority and queue

`live-rooms.js` extends the Phase 1 membership service. Every room command, subscription, presence transition and playback timer enters the same FIFO. `queue-reducer.js` is a pure, versioned reducer. Next Up always sorts by voter count descending, enqueue sequence ascending, then entry ID. Votes are sets of authenticated user IDs; duplicate PUTs do not increase the count. Promotion reserves immediate next without changing vote order.

Enqueue/remove/promote/playback require Host or Co-DJ; votes require current membership. Settings, invite rotation, moderation and transfer require the current Host. Global Admin grants no room authority. Authority transfers update both memberships and the lounge owner in one transaction. Removal detaches all of the user's room subscriptions; leave detaches presence but retains membership for rejoining. Muting is persisted and the tested `unmutedMember` guard is ready for Phase 4 chat/reactions; those endpoints are not implemented in Phase 2.

Both promotion and advance read current track profiles and deterministically enforce the BPM tolerance (including half/double tempo) and Camelot compatibility. Pending profiles are not eligible for a segue. This necessary safety filter precedes Phase 3 ranking/generation. Initial playback can start a local track without pretending that its unknown acoustic profile is verified. Metadata-only seeds cannot play.

## Durability and recovery

The process-wide FIFO holds at most 500 event/checkpoint pairs. It flushes on a one-second cadence or at 50 events, with at most 50 events per replica-set transaction. Events use unique `(loungeId, epoch, revision, eventSeq)` keys; an idempotent upsert and recovery checkpoint are committed together. The checkpoint also projects lounge status. No synchronous database write is made for each vote.

Acknowledgements contain `{ok,epoch,revision,durableRevision}`. Acknowledgement precedes durability. The one-second cadence is **not** a guarantee of a maximum one-second loss window: slow or failed persistence can extend the delay. A crash can lose accepted but unflushed events, up to the bounded buffer. Failed writes pause playback, stop room mutations and return readiness 503. Read/snapshot access remains available. Transaction aborts and lost commit responses are tested; retry does not duplicate events. After a healthy retry, safety pauses and security projections are reconciled before mutation availability returns.

The latest checkpoint plus later events are replayed with reducer-version and contiguous-revision checks. A fresh process assigns a new epoch, clears presence, pauses at the durable playback position and requires Host resume. It does not count downtime as listening or claim to know which unflushed events were lost. A killed-Node-process test verifies durable recovery and loss of an intentionally unflushed command. Graceful shutdown stops acceptance, drains accepted work and flushes before closing the database; failure to flush propagates as an error.

Live command receipts retain the most recent 256 command IDs per room, including their actor, canonical request hash and result. Repeated IDs with different payloads return 409. Receipts survive durable recovery; they do not guarantee retry protection for lost or evicted commands. The separate Phase 1 lounge-creation receipt still has its 24-hour TTL. Invite codes are derived from the signing key and command ID; persistence holds their hashes rather than plaintext invite codes.

## Synchronization and presence

Each socket joins its authorized room; unique users, rather than tabs, determine presence. The last participant tab starts a 10-second departure grace. The last Host tab freezes mutations and pauses playback immediately, independent of that grace. Reconnection unfreezes the queue, while playback stays paused until explicitly resumed. An explicit leave or removal bypasses grace. The development tests shorten participant grace to 60 ms; the shipping default is 10,000 ms.

`lounge.subscribe` / `lounge.resync` subscribe and capture a snapshot under the room serializer. Their acknowledgements include the baseline snapshot and durability fields. The client buffers up to 64 newer snapshots during catch-up, rejects old revisions/retired epochs and requests resync on epoch changes or revision gaps. Periodic ping/pong estimates RTT and a monotonic client clock anchor.

Outbound snapshots are coalesced to the newest complete state per event-loop turn. This bounds redundant burst traffic; revision gaps explicitly invoke catch-up. Specialized `lounge.queue.update`, `lounge.presence.update` and `lounge.status.update` notifications are volatile hints only. They never independently mutate the client queue. Snapshot `eventSeq` is 0; notification indices are transport-local and are not additional durable reducer events. Slow transports with more than 20 buffered packets are disconnected for resync. A room permits eight tabs per identity, 512 queued operations and 200 queue entries. This instance limits loaded rooms to 50; automatic idle-room eviction is not implemented.

## Playback and controls

The server uses a wall-clock anchor plus monotonic elapsed time. Browser elapsed bars derive from server playback timestamps, not local track-ended events. Each device must click Enable audio to resume its Web Audio context. Audio is fetched with Authorization in bounded 1 MiB ranges and assembled into a local blob before playback (25 MiB server file cap); no token is placed in URLs. This is buffered local playback, not progressive media-source streaming or sample-accurate multi-device synchronization. The client corrects drift larger than 750 ms and pauses on disconnection/freeze.

Play, Pause, Skip/Advance, Lock/Unlock, Rotate Invite, queue controls and membership controls use the same server authority. Track end pauses and awaits an explicit advance; autonomous segue selection, battle timers and AI remain later phases. Reads remain available when frozen. The console includes ordered vote counts, reduced-motion-aware reorder animation, connection quality, recovery/durability details and a frozen banner.

## Migration and operating notes

Migration `003-live-rooms` adds `queue_events` and `room_snapshots`, their unique indexes and strict database validators. Migrations 001/002 were not changed. Existing accounts, media, membership and profiles remain compatible; rooms acquire their checkpoint lazily on first load. Stop the old application before migrating and back up the database plus asset manifest first. The local import utility already takes an ignored Extended JSON backup before migration; it is safe to rerun against the same library.

Do not run Phase 1 and Phase 2 instances concurrently. Rolling back to Phase 1 would ignore the new authoritative queue and playback state; stop traffic and restore a reviewed pre-migration backup to a new database/volume if reverting. Do not delete or reset the live database. Production restore rehearsal remains Phase 6.

Tests and measured local results are recorded in [implementation status](IMPLEMENTATION_STATUS.md) and [browser timing evidence](../evidence/phase-two-browser-latency.json). None of these results certifies 50-user load, production resilience, licensing, acoustic accuracy of imported songs or AI quality.
