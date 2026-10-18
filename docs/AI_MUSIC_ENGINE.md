# AI and music engine

Implements REQ-010–017 with local authorized media and authored metadata. No Spotify audio, metadata, user profiles or playlists enter any model. The model writes explanations; deterministic code decides eligibility and changes state. Real waveform analysis, beat alignment and audible crossfade are out of scope.

## Acoustic matching and selection

For current BPM `b>0`, candidate BPM `c>0`, compute `delta = min(abs(c/(b*m)-1))` for `m in {0.5,1,2}`. Eligible tempo requires `delta <= tolerancePct/100`; default 8, allowed range 0–8 under the provisional interpretation of the hard bound. Reject NaN/infinity/zero before evaluation. Report selected multiplier and normalized delta percentage; raw BPM difference alone is misleading for half/double time.

Parse key into number 1..12 and A/B. Allow same key, ±1 number on the same letter with 12↔1 wraparound, or same number/opposite letter. Reject every other relation. Hard filter both rules before ranking, battle splice, manual promotion and final playback commit.

Among eligible candidates use PRD weight formula `0.50*H + 0.30*E + 0.20*R`. P: H=1 identical, 0.8 relative major/minor, 0.7 adjacent; E=`1-abs(candidate.energy-targetEnergy)`; R=0 if present in last N played IDs, else 1. P: N=5; targetEnergy=`clamp(current.energy + 0.2*rollingSentiment,0,1)` with sentiment in [-1,1]. Tie-break by vote count, enqueue sequence, then ID. Numeric sub-scores are proposed calibration choices; weights and hard eligibility come from the PRD. Valence is retained for taste/recommendation similarity; it does not override eligibility.

Vote ranking orders the queue display; AI eligibility/score chooses an explanation proposal. An eligible battle winner or approved manual reservation takes precedence as documented in [architecture](ARCHITECTURE.md). Incompatible battle winner stays queued with `applicationStatus=deferred`. No eligible candidate yields `selectedTrackId:null`, `reason:NO_COMPATIBLE_TRACK`; pause at end rather than forcing a clash. Host approval rechecks current track, settings, profile versions and room revision. No model can approve its own proposal.

Seed example (invented demo data, not source facts): Original Loop A 120 BPM/8A/0.6 energy; Original Loop B 124/9A/0.7; Original Loop C 128/9B/0.65. A→B→C passes. Use actual authorized files and authored lore corresponding to these profiles; do not repeat the source's fictional sample-credit example as verified provenance.

## Sentiment

Start with a small, versioned JavaScript lexicon scorer including negation, intensifiers and an explicit neutral band. Map scores to [-1,1] and buckets using thresholds calibrated on a training split. This is a baseline, not a claimed 85%-accurate model. Compare against a lightweight local classifier only if the baseline misses the held-out target. Keep sentiment local and do not use an LLM call on every chat message.

P: 30-second rolling window, recompute every second, neutral score 0 on empty window. Score human chat only, exclude AI/system output and removed messages, cap contribution per user per tick to reduce spam influence. Use server receipt time. Expose score/window/sample size. Keep emotion classification distinct from inferred musical preference: sarcasm, code-switching, negation and “sad song please” can defeat simple sentiment. English-only demo is provisional and visible in UI. No demographic/personality profiling.

Build a manually labeled test set, proposed minimum 150 messages balanced across buckets and including negation, emojis, sarcasm and music requests. Split by author/template family, keep evaluation locked, report per-class precision/recall/confusion matrix as well as accuracy ≥85%. Report failures; do not tune on held-out messages. A scripted positive→negative burst must visibly change rolling score within one 30-second window.

## Grounded generation and Q&A

Retrieve only active track/recent track authored timeline entries plus validated acoustic facts. Start with lexical matching and timestamp proximity; three demo tracks do not justify embeddings or a vector database. Give each retrieved entry an immutable citation ID and profile version. Allow maximum 5 entries/4,000 context characters and 500 question characters (P). Model prompt treats question and metadata as untrusted data, requests brief text with source IDs, and cannot invoke tools.

Local Ollama is a provisional adapter choice: `/api/generate` supports JSON/schema output and configurable streaming ([official API](https://docs.ollama.com/api/generate)). Pin a specific model artifact and license after hardware evaluation; no model is assumed to meet latency or accuracy today. Local structured output support does not establish cloud support or factual grounding ([structured output limitations](https://docs.ollama.com/capabilities/structured-outputs)). An alternate hosted provider requires privacy, quotas, model/context limits and cost verification before selection; none is silently assumed.

Validate output length, JSON schema, source IDs belonging to retrieved context and whether factual claims are supported. Merely checking cited IDs cannot prove entailment: use a constrained fact-selection output with server-rendered factual sentences for the strict baseline; optional freeform paraphrase requires a manually reviewed evaluation set. Unknown questions return an explicit insufficient-metadata answer with no invented citation. Acoustic explanations can be rendered deterministically from matchReason; no fabricated lore needed.

P: trigger 10 seconds before end; cache by current/candidate/profile versions, sentiment bucket and verbosity. Warm the model before demos. Time budget: 200 ms matching/retrieval, up to 2.3 s generation, 200 ms validation/publish, leaving margin under 3 s. These are budgets, not measurements. Timeout/provider failure returns a grounded template with `generationMode:template`; record separately from successful model output. A fallback does not prove LLM latency compliance. Cancel or discard stale jobs after track/config changes. Banter is text only.

## Hybrid recommendations and interaction fitting

Collect own-session listens/likes from authorized participants. Derive played time from server scheduling plus bounded client heartbeat evidence, cap by duration and never trust arbitrary client durations. P: completed at ≥80% duration. Build a user-track implicit matrix using completion + like signals; infer co-listening from shared lounge/playback intervals rather than storing quadratic user pairs.

Fit item-item cosine collaborative similarity and normalized acoustic feature similarity in a worker thread. P: rank `0.6*content + 0.4*collaborative` for users with evidence; otherwise content/vibe and diverse catalog fallback. These weights are separate from mandatory segue weights. Record algorithm/version, training cutoff, data hash and fit counts. Exclude already consumed items in held-out evaluation; keep live repeat rules explicit. Refit on explicit admin job or a proposed 5-minute debounce after new data; atomically swap active artifact without redeploy. Failure keeps previous valid model. Expose modelVersion/fallbackReason and empty-state guidance.

Precision@5 = relevant held-out items in first five / 5, averaged over eligible users. Generate interactions through scripted and manual system use with distinct users/sessions; use chronological split, train on earlier sessions, and no target leakage. Need ≥5 unseen candidates per evaluated user and enough held-out positive interactions; propose ≥20 tracks and ≥10 consenting demo identities. Three demo tracks cannot validate the metric. Report population, coverage, train/test counts and all users excluded for insufficient data. Synthetic-data success demonstrates implementation only, not general music preference quality. Acceptance is ≥0.6 on this declared held-out set; do not fabricate outcomes.

## Analytics

Derive duration from start/end events, peak participants from unique-user joins/leaves, battle count from opened battles and question count from accepted Q&A requests (including unanswered requests, excluding duplicate command IDs). Sentiment timeline uses persisted ticks. Dashboard taste uses actual listening-weighted BPM/key/energy aggregates. Session summary must reconcile with event-log replay and a manually verified session; watermark ensures no unflushed tail is silently omitted.
