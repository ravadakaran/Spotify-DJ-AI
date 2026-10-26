# Phase 3 implementation — 26 October 2026

TASK-014–016 now have executable server and React implementations. Phase 0 legal-audio and real-model gates remain open. Metadata fixtures and disposable silence tests are not playable demonstration songs or evidence of LLM quality. No model was installed or downloaded and no private library was sent to a model.

## Matching and authority

`music-engine.js` validates complete ready profiles, rejects invalid tolerance outside 0–8%, checks all three tempo multipliers and the four allowed Camelot relationships, then scores 0.50 H + 0.30 E + 0.20 R. The documented provisional H values, N=5 and sentiment-driven target energy are implemented. Sentiment defaults to zero until Phase 4 supplies server-owned sentiment. Only queued tracks with an asset reference are suggested; metadata-only fixtures stay excluded in ordinary use. An eligible manual reservation wins before score; remaining ties use votes, enqueue sequence and entry ID. Battle precedence remains Phase 4.

Approval reserves immediate next. Explicit Advance performs the existing final live-profile compatibility check and starts playback. Approval itself never starts audio. A rejection, unavailable proposal, missing approval or track completion leaves playback paused at the end. Manual Advance remains an independently authorized Phase 2 control. This deliberately preserves its existing contract.

One automatic request per playback starts at the 10-second outro threshold on the 200ms server tick. A failed/stale automatic request is not retried continuously: the Host/Co-DJ can request again. Each generation captures epoch, revision, playback and profile versions; generation runs outside the room FIFO and publication re-enters it. Any revision or profile change discards the result. Approval additionally validates the proposal revision, playback, queue membership, current profiles and hard eligibility. Even a vote or accepted question can stale a proposal; the UI requests a fresh suggestion. Host disconnection freezes AI operations. Restart clears actionable proposals and pauses playback.

## Grounding and local adapter

Lexical retrieval searches authored timeline facts and validated acoustic fields for the requested current/recent track, ranks overlap then timestamp proximity, and limits context to five facts/4,000 serialized characters. Questions are capped at 500 characters. Citation IDs contain track ID, profile version and event/field ID. The answer returns source text and provenance; it does not certify the author's truthfulness. Lexical retrieval can miss paraphrases or return related excerpts rather than a complete answer. Empty context produces an explicit insufficient-metadata response.

The strict model response is only `{sourceIds:[...]}`. Schema, duplicate IDs, output length and context membership are checked; factual sentences are always rendered from supplied facts. Model prose cannot enter answers. This is constrained fact selection, not freeform paraphrase or verified model entailment. Authored text remains untrusted and React renders it as text. Models have no tools or queue mutation capability.

Default operation is `generationMode:template`, `fallbackReason:MODEL_DISABLED`. To opt into a separately evaluated local model, set `AI_METADATA_APPROVED=true` and `OLLAMA_MODEL` to the reviewed artifact. The operator must first verify model/license/hardware and permission for all authored metadata used in the room; those environment settings are an explicit gate, not proof of clearance. Only metadata is sent, never audio, identity, chat or credentials. The endpoint is fixed to loopback `http://127.0.0.1:11434/api/generate`, redirects are rejected, streaming is disabled, schema is provided and response bytes are capped at 16 KiB. No hosted provider is configured.

Generation is aborted after 2.3 seconds and falls back on timeout, malformed output or provider failure. Eight global in-flight jobs and 12 requests/minute/member bound work. Identical concurrent command retries share one job. There is no cross-request generated-answer cache; every new request re-retrieves current profile versions. The latest 256 room receipts provide bounded retry results. Successful publications count model/template outcomes in `rooms.aiMetrics`; individual responses record generation mode, fallback reason and duration. These are diagnostic implementation timings, not full trigger-to-render latency benchmarks.

## API and persisted state

All routes require room membership and use existing authentication and command IDs. HTTP and socket commands share the same authority:

| Route / socket type | Request | Result |
| --- | --- | --- |
| POST `/lounges/:id/ai/segue` / `ai.segue` | `{expectedRevision}`; Host/Co-DJ | revision ack plus `proposal` |
| POST `/lounges/:id/ai/segue/:proposalId/decision` / `ai.decision` | `{expectedRevision,decision:"approve"\|"reject"}`; socket also supplies proposalId; Host/Co-DJ | revision ack; snapshot carries reservation/status |
| POST `/lounges/:id/ai/questions` / `ai.question` | `{trackId,question}`; member | revision ack plus answer, citations, sourceEvents, profileVersion, generationMode, fallbackReason, insufficientMetadata |

The mandatory source segue example remains in the API specification as an illustrative source contract. Implemented requests accept only expectedRevision; current track, time, candidates and sentiment come from authority, never client inputs. Unknown fields return 422. No candidate yields a proposal with selectedTrackId null and reason `NO_COMPATIBLE_TRACK`. Stale publication returns `STALE_GENERATION`; stale approval returns `STALE_PROPOSAL`; admission revision mismatch returns `STALE_REVISION`.

Snapshots add `segueProposal`, `recentTrackIds` (five) and `questionCount`. The existing `lounge.ai.dj_announcement` event is a notification hint; only the coherent snapshot changes client state. Questions do not broadcast private answers. Actor-bound receipts retain bounded answer results for retries and are stripped from snapshots; these results are persisted in private event/checkpoint data. Question text itself is not persisted. Question count includes unsupported accepted requests and excludes retries. Phase 5 summary reconciliation remains pending.

New reducer events `ai.segue`, `ai.decision`, `ai.question` are additive to reducer v1; existing v1 checkpoints without the fields load with defaults. Collection validators already allow their payload/state objects, so no database migration or local-data reset was needed or run. Older application builds cannot replay the new event types: before rollout, back up DB/assets; rollback requires the pre-Phase-3 backup or a forward-compatible reader, with loss of later changes explicitly accounted for. No local deployment was performed by this implementation task.

## Verification and remaining acceptance

Automated coverage includes 576 Camelot pairs, 24 ranked decisions, tempo boundaries/half/double time, score and reservation behavior; authored-fact retrieval and 30 controlled questions (20 supported/10 unsupported); invalid IDs/schema, injected model text and deadlines; real-replica-set A→B→C simulated playback, permission denial on HTTP/socket, question retry counting, stale room/profile checks, concurrent votes during generation, one outro trigger and end pause, plus replay from an older checkpoint. Mock providers are labeled in tests; no real-model quality or latency result is claimed. Browser coverage adds suggestion/approval and supported/unsupported Q&A to the two-session playback journey.

Final executed commands/results are recorded in IMPLEMENTATION_STATUS.md. The approved legal demonstration chain, audited real-model responses, and real-model P95 <3s trigger-to-render target remain unverified. Later chat/sentiment/battle/recommendation/analytics phases remain unchanged in scope.
