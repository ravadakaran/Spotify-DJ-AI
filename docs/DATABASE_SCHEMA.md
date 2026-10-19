# Database schema

Phase 1 as built: immutable migrations 001/002 and a unique migration runner lock protect startup; database validators reject invalid profiles even through raw writes. Tracks may use `profileStatus: pending` with null `acoustic` for private imports, or `ready` with a valid profile. Administrator profile updates atomically set ready and increment `profileVersion`. Imported assets have `uploadedBy: null`, `importActor: local-operator`, SHA-256 provenance and detected MIME type. `command_receipts` has unique `(actorId, commandId)`, canonical request hash, lounge ID/creation time and 24-hour TTL; create receipts are committed with the lounge and host membership. Old migration files must not be reformatted or edited.

Selected implementation: MongoDB/Mongoose (PRD Option B). This document defines proposed storage, not migrations already executed. UUID strings identify application records and are serialized identically in JSON. References below are logical foreign keys; MongoDB does not enforce referential integrity across collections. Services validate references and use transactions for coupled persistent changes. All times are UTC BSON dates; elapsed media time uses seconds; vote counts/revisions are integers.

Foundation update: users, refresh_sessions, audio_assets, tracks, lounges, memberships and schema_migrations now exist in code; the rest of this document remains the target. Refresh family is one session document with current tokenHash, consumedHashes, absolute expiresAt and revokedAt, rather than linked per-token rows. JWT `sid` references that family; replay/logout revoke it and its sockets. Track assetId is nullable only for clearly marked `demoMetadataOnly` fixtures (public track creation still requires an asset). Lounge revision tracks durable membership changes. Initial migration hashes the model definition and creates indexes; server validators exist, but database-level JSON schema validators and a general multi-migration runner remain pending.

## Collections and fields

Unless marked optional, fields are required. All collections have `_id: UUID`, `createdAt: Date`, `schemaVersion: integer=1`; mutable collections also have `updatedAt`. Never expose password/token fields through response serialization.

| Collection | Fields and constraints | Indexes |
| --- | --- | --- |
| users | `emailNormalized:string`, `displayName:string(1..80)`, `passwordHash:string`, `isAdmin:boolean=false`, `disabledAt:Date?` | Unique emailNormalized |
| refresh_sessions | `userId→users`, `tokenHash:string`, `familyId:UUID`, `expiresAt:Date`, `revokedAt:Date?`, `replacedBy:UUID?` | Unique tokenHash; userId; TTL expiresAt (authorization still checks time) |
| tracks | `title:string(1..160)`, `artist:string(1..160)`, `durationSeconds:number>0`, `assetId→audio_assets`, `acoustic:{bpm:number>0,camelotKey:string,energy:number,valence:number}`, `profileVersion:int>0`, `timeline:[{id:UUID,ts:number,type:enum,text:string,sourceLabel:string}]`, `archivedAt:Date?` | acoustic.bpm + acoustic.camelotKey; archivedAt; title |
| audio_assets | `storageKey:string`, `mimeType:string`, `byteLength:int>0`, `sha256:string`, `licenseLabel:string`, `sourceAttribution:string`, `uploadedBy→users` | Unique storageKey; sha256 |
| lounges | `hostUserId→users`, `seedTrackId→tracks`, `vibeProfile:string`, `status:scheduled/live/ended`, `settings:{maxParticipants:int[2,50],bpmTolerancePct:number[0,8],soundclashEnabled:bool,aiVerbosity:brief/normal}`, `inviteHash:string`, `inviteExpiresAt:Date`, `locked:bool`, `startedAt:Date?`, `endedAt:Date?`, `summaryStatus:none/pending/complete` | Unique inviteHash; hostUserId+createdAt; status |
| memberships | `loungeId→lounges`, `userId→users`, `role:listener/co_dj/host`, `muted:bool`, `removed:bool`, `joinedAt:Date`, `leftAt:Date?` | Unique loungeId+userId; userId+joinedAt |
| room_snapshots | `loungeId→lounges`, `epoch:UUID`, `revision:int>=0`, `reducerVersion:int`, `state:object`, `persistedAt:Date` | Unique loungeId (latest recovery checkpoint only) |
| queue_events | `loungeId→lounges`, `epoch:UUID`, `revision:int`, `eventSeq:int>=0`, `commandId:UUID`, `actorId→users?`, `type:string`, `payload:object`, `reducerVersion:int`, `occurredAt:Date` | Unique loungeId+epoch+revision+eventSeq; loungeId+occurredAt; loungeId+commandId |
| chat_messages | `loungeId→lounges`, `messageId:UUID`, `userId→users?`, `msgType:chat/ai_answer/system/dj_announcement`, `body:string`, `sentimentScore:number?`, `sentimentBucket:positive/neutral/negative?`, `tsSeconds:number>=0`, `sourceEvents:[UUID]`, `eventId→queue_events` | Unique messageId; loungeId+createdAt+_id; unique eventId |
| chat_reactions | `loungeId→lounges`, `messageId→chat_messages.messageId`, `userId→users`, `emoji:allowlisted string` | Unique messageId+userId+emoji |
| interactions | `userId→users`, `trackId→tracks`, `loungeId→lounges`, `playbackId:UUID`, `playedSeconds:number>=0`, `completed:bool`, `liked:bool`, `startedAt:Date`, `endedAt:Date?`, `eventId→queue_events` | Unique userId+playbackId; userId+createdAt; trackId+createdAt |
| session_summaries | `loungeId→lounges`, `durationSeconds:number`, `peakParticipants:int`, `battleCount:int`, `questionCount:int`, `sentimentTimeline:[{at:Date,score:number,sampleSize:int}]`, `sourceWatermark:{epoch,revision}`, `algorithmVersion:int` | Unique loungeId |
| model_versions | `version:string`, `status:training/ready/failed/active`, `trainedThrough:Date`, `dataHash:string`, `config:object`, `metrics:object`, `artifactKey:string`, `failureReason:string?` | Unique version; status+createdAt |

Timeline IDs are unique within a track and immutable across edits; references always include trackId/profileVersion when interpreting historical citations. Camelot key regex: `^(?:[1-9]|1[0-2])[AB]$`. Energy and valence are finite in [0,1]. Timeline time is in [0,durationSeconds]; type is sample_credit/trivia/glossary. Proposal limits: timeline ≤100 entries, each text ≤2,000 characters, chat ≤1,000, question ≤500. Maintain validation in request schemas and Mongoose, with MongoDB JSON schema validators for critical types/ranges.

## Room snapshot payload and event model

Snapshot state includes ordered `queueEntries:[{entryId,trackId,addedByUserId,enqueueSequence,position,voters:[userId]}]`, `nowPlaying:{playbackId,trackId,startedAt,pausedOffsetSeconds}|null`, `battle:{id,status,candidates,votesByUser,closesAt,winnerCandidateId,applicationStatus}|null`, pending segue proposal, recent played IDs, and rolling sentiment inputs. Candidate contains candidateId/trackId/submitterId. Persist votes in batches through events and recovery snapshots; do not create per-vote synchronous database writes. Position is derived from array order, not a competing authority.

Ephemeral sockets, typing state and ping samples do not persist. Unique-user presence transitions are events so peak concurrency can be reconstructed. Accepted chat, vote change, battle lifecycle, playback, question, moderation, profile version reference and sentiment tick events drive all projections. Store canonical event inputs and rule versions for replay; do not rely on re-running an LLM during replay. Persist the generated result and citations.

Atomicity: one batch transaction inserts immutable events and updates chat/reaction/interaction projections plus recovery watermark. Snapshot updates are partial recovery checkpoints, not final analytics summaries. The latter are written only on end-session after all batches flush. Normal command acknowledgements can precede persistence; see REQ-018 and OQ-04.

## Relationships

```mermaid
erDiagram
  USERS ||--o{ MEMBERSHIPS : joins
  LOUNGES ||--o{ MEMBERSHIPS : includes
  USERS ||--o{ REFRESH_SESSIONS : owns
  USERS ||--o{ LOUNGES : hosts
  AUDIO_ASSETS ||--o{ TRACKS : serves
  TRACKS ||--o{ INTERACTIONS : heard
  USERS ||--o{ INTERACTIONS : records
  LOUNGES ||--o{ INTERACTIONS : groups
  LOUNGES ||--o{ QUEUE_EVENTS : records
  LOUNGES ||--o| ROOM_SNAPSHOTS : recovers
  LOUNGES ||--o{ CHAT_MESSAGES : contains
  CHAT_MESSAGES ||--o{ CHAT_REACTIONS : receives
  LOUNGES ||--o| SESSION_SUMMARIES : finalizes
```

The diagram represents logical references and ownership, not SQL FK enforcement. Queue entries, candidates and votes live inside bounded room state; their historical mutations remain in queue_events. Limit queue to a provisional 200 entries and chat history to cursor pages; do not embed unbounded chat/interactions in lounges. Bound session duration or archive events to avoid unbounded memory; keep only rolling sentiment/history windows in process.

## Relational comparison required by PRD §3

For Option A or C only, PostgreSQL would normalize users/refresh_sessions/tracks/audio_assets/lounges/memberships and the event/projection tables above. `track_timeline_events(id PK,track_id FK,profile_version,ts,type,text,source_label)` replaces embedded timeline; `queue_entries(id PK,lounge_id FK,track_id FK,position,enqueue_sequence,added_by FK)` and `queue_votes(entry_id FK,user_id FK, PK(entry_id,user_id))` replace queue arrays. Battles/candidates/battle_votes use analogous foreign keys and unique `(battle_id,user_id)`. A partial unique index on active battle per lounge enforces one battle. Unique `(lounge_id,position)` must be deferrable or positions swapped through temporary values in an atomic reorder. Sparse positions can reduce single-move writes, but full vote sorts may still rewrite several rows. Both models retain in-memory authority and batched event persistence; neither requires DB writes on each vote. PostgreSQL is not an additional deployed store.

## Migrations, data integrity and retention

Use ordered `server/migrations/NNNN-description.js` files with checksums and a migrations ledger, one migration runner at a time. Create validators/indexes before seed insertion. Seed idempotently using stable demo IDs; do not overwrite user edits. Bootstrap admin through an operator-only command, never public registration. A single-node MongoDB replica set enables transactions; a standalone server is insufficient ([MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)).

For changes: backup first, add optional fields/indexes, backfill in bounded batches, validate, switch reads, then remove obsolete fields in a later release. Take a pre-migration snapshot; restore to a new volume to test recovery. Prefer forward repair over destructive down migrations. Profile updates increment version and invalidate caches/proposals. Archive tracks referenced by history; prohibit deleting referenced audio without an explicit archival policy. Proposed 30-day demo retention must preserve linked events/projections together; do not TTL queue_events independently of summaries and evaluations. Export/anonymize user-linked test data and document backup retention before broader use.
