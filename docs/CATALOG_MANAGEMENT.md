# Admin catalog management — 28 October 2026

User-authorized enhancement IMP-002 extends the library editor with title/artist editing, audio replacement and permanent track deletion. It extends REQ-001/010/021; these controls are not represented as original PRD requirements. Track A/Option B and authorized local audio constraints remain unchanged.

## User flow

As an administrator, open **Overview → Local music library**, search for the track, then choose **Edit profile**, **Replace audio** or **Delete**. Edit profile includes title/artist and acoustic values. Delete opens an inline confirmation with Cancel and Delete track permanently. Other users retain preview access.

End **all** scheduled/live lounges first. Pausing, disconnecting or returning to Overview does not end a lounge. Whole-track updates/deletion return 409 while any lounge is not ended. This conservative first version prevents changes to audio referenced by current playback, queues, battles or pending generation. Per-track live editing is not implemented. The existing acoustic-profile API retains its original contract and final segue revalidation.

Replacement accepts WAV/MP3/audio-only M4A up to 25 MiB through the existing admin upload, with license and attribution. Confirm acoustic values for the new recording; duration is read from the file. Replacement preserves track ID, increments profileVersion and clears old timeline notes. Audio trimming/processing happens externally before upload. Successful mutations clear the local preview and refresh the catalog. In-flight saves disable duplicate submissions. A failed linking request retains the uploaded asset ID for retry while the form stays open.

## HTTP contracts

Paths are relative to `/api/v1`. All mutations require server-enforced admin authentication. No socket event is added or renamed. Existing mandatory examples remain valid.

`PUT /tracks/:id` requires a complete validated edit:

```json
{
  "expectedProfileVersion": 1,
  "title": "Original recording",
  "artist": "Local artist",
  "assetId": "40e75911-8610-4bdb-a3ad-dfb4195dc614",
  "acoustic": { "bpm": 120, "camelotKey": "8A", "energy": 0.5, "valence": 0.6 },
  "timeline": []
}
```

Upload replacement media with existing `POST /assets` first, then send its assetId. A changed assetId requires an empty timeline and valid contained audio; durationSeconds is derived and is not accepted in this edit payload. Unchanged null assetId permits editing metadata fixtures; attached media cannot be detached to null. PUT returns the existing full track profile plus assetCleanup.

`DELETE /tracks/:id` takes `{"expectedProfileVersion":1}` and returns 200 with `{"trackId":"…","assetCleanup":"removed"}`. Absent track: 404; stale version: 409 `STALE_PROFILE`; active/scheduled lounge: 409 `CATALOG_IN_USE`; invalid input/audio: 422; escaped asset path: 403. There is no force-delete bypass. Deletion of an already absent track returns 404.

Cleanup results: `none` (no previous audio), `shared` (another track references it), `removed` (unreferenced file/record removed or file already absent), `retained` (cleanup failed; record retained for recovery). The UI reports shared/failed cleanup. A retained result means the track mutation succeeded.

## Authority, schema and recovery

A bounded in-process RoomService `catalog` FIFO serializes room creation, track creation, full edits and deletion. The idle check runs inside this lock. Room creation either observes the edited track, wins before deletion and blocks it, or rejects the deleted seed. Existing room commands retain per-room authority. Compare-and-set on profileVersion handles concurrent edits/deletion and legacy profile updates. No new schema, migration, reducer or queue event is needed.

After the track mutation, cleanup checks remaining track references, resolves the real root/target, enforces containment and unlinks only unshared media. The asset record is removed after unlink. Past lounge documents, events, interactions and summaries are preserved; historical track IDs can outlive catalog entries. Deletion does not erase backups, fetched browser bytes or original external source files.

MongoDB and filesystem operations are not atomic together. Crashes/cleanup errors can leave unreferenced files or records; interrupted uploads or cancelling after failed linking can leave uploaded assets. No automatic orphan collector or cleanup retry UI is provided. Retained assets require operator reference/containment review before cleanup. Keep backups for recovery; successful deletion is permanent in the UI. Backup/restore compatibility is unchanged; restoring an older backup can restore deleted media. Seed reruns can recreate known metadata fixtures, but do not recreate imported private tracks. The lock assumes the documented single application instance. Concurrent imports/operators must run with the application stopped.

## Verification

`catalog-management.integration.test.js` uses an isolated real MongoDB replica set and generated silence to check authentication/admin permissions, validation, stale versions, measured replacement duration, timeline clearing, file cleanup, shared retention, catalog removal, concurrent edits, create/delete exclusion and cleanup containment. The browser scenario checks mobile edit/replace/preview, cancel/confirm deletion, preview cleanup and shared retention. [Mobile evidence](../evidence/catalog-management-mobile.png); actual command results are in [implementation status](IMPLEMENTATION_STATUS.md).

Tests do not modify the private library, end private lounges, deploy, migrate private databases, install services or change credentials. Legal audio/model/evaluation/latency acceptance gates remain open.
