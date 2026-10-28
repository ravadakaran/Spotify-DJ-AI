# Security

Phase 6 verifies cookie-refresh exact Origin/CSRF (bearer APIs use explicit tokens), object/prototype injection, size limits, HTTP/socket authorization and slow consumers. Body-parser 2.4.0 and Multer 2.5.0 patch reviewed DoS advisories. A low-severity Jest/deepmerge development advisory remains; consult saved audit reports. Backups contain private users/sessions/chat, require stopped writers, trusted storage/owner-only ACLs and empty restore targets. [Scope of audit and accessibility evidence](PHASE_SIX_IMPLEMENTATION.md).

REQ-003, REQ-008 and REQ-021 apply to all implementation phases. Threat model is a private demo with untrusted participant input, not a permissionless production service. Protect credentials, chat history, role boundaries, local files, and room integrity. A malicious Listener may forge IDs, votes, socket events, metadata prompts and repeated requests; the server remains authoritative.

## Permission matrix (provisional room scoping)

| Action | Listener | Co-DJ | Host | Global Admin |
| --- | --- | --- | --- | --- |
| Create own lounge | Yes | Yes | Yes | Yes |
| Read/chat/vote/submit/Q&A | In joined room | In joined room | Own room | Only with membership |
| Queue override/playback/resolve battle/approve segue | No | Joined room | Own room | Only with suitable room role |
| Lock/mute/remove/change role/transfer/end | No | No | Own room | Only with Host membership |
| Upload acoustic profile/audio | No | No | No | Yes |
| Train model job | No | No | No | Yes |

Users register as non-admin; Host is assigned transactionally when creating a lounge. Ignore/reject client-supplied role/owner/userId. Use persisted membership for authorization, invalidate in-memory role cache on moderation and disconnect removed users. Host transfer is one atomic membership/host-field change; never leave two Hosts. AI service calls have explicit internal capabilities rather than an all-powerful JWT.

## Authentication and token lifecycle

Hash passwords with a maintained Argon2id implementation and parameter settings benchmarked on deployment hardware. P: passwords 12–128 characters, no truncation, generic login errors, login throttling. Issue 15-minute access JWTs (under PRD one-hour maximum), allowlisted signature algorithm, required issuer/audience/sub/iat/exp/jti. Signing keys come from environment/secret files; rotate with key IDs and overlap only until existing tokens expire.

Keep browser access JWT in memory; refresh credential in HttpOnly Secure SameSite=Strict cookie restricted to auth route. Rotate refresh on every use, store only a cryptographic hash with token-family linkage, revoke entire family on replay. Proposed refresh lifetime seven days; server checks expiration even before database TTL deletion. Serialize browser refresh calls to avoid accidental reuse. Logout revokes refresh family; access may remain valid up to 15 minutes unless session revocation is checked for immediate logout. Recommended: include session ID and consult cached revocation state on HTTP/socket commands, invalidating on logout.

Require same-origin Origin checks and anti-CSRF header/token for cookie-auth refresh/logout; exact CORS origin, never wildcard credentials. Sockets use handshake auth field plus Origin allowlist, expiry timer and room-sensitive checks. Never put tokens in URLs, application logs or browser persistent storage. Local HTTP is allowed only for loopback development with an explicit cookie configuration; private network deployment uses TLS.

## Input, file and AI boundaries

Validate route/body/socket payloads with shared schemas, reject unknown keys, lengths, invalid numbers and MongoDB operators. Construct database queries from allowlisted fields, never accept arbitrary client filters. Escape text through React's normal text rendering; do not use raw HTML/Markdown rendering without a vetted sanitizer. Messages/reactions get fixed size and emoji bounds.

Admin audio upload validates magic bytes, MIME, size and filename-independent storage keys; deny executable formats and archive extraction. Enforce resolved path stays under asset root; no user-controlled URL fetching (avoids SSRF). Serve with appropriate Content-Type, nosniff, authenticated access, and bounded Range requests. Record license/source; do not infer that “royalty-free” means unrestricted reuse.

RAG metadata/questions are untrusted even from an Admin. Model has no network/tools/secrets and receives only relevant authored context. Output cannot issue commands. Validate citation membership and constrained factual output; refuse unsupported facts. Chat sentiment and recommendation data remain local. Any hosted provider needs explicit retention, training-use, region, quota and cost assessment before enabling it.

## Abuse and denial of service

Proposed starting limits, tune after measurement: login 5/minute/IP plus account backoff; authenticated REST 120/minute/user; chat 5/10 seconds/user; votes 10/second/user; Q&A 5/minute/user with one outstanding generation/user and two/room; typing 1/second; 50 unique participants/room and 200 queued tracks. Configure room/session count from measured memory budget, not a hard-coded single-room design. Return 429/Retry-After. Deduplicate vote identity, cap buffers, bound model timeouts and input length, and isolate fitting in a worker thread.

## Privacy, operational controls and incident response

Collect only login identity, display name, authored media and demo interactions. Do not log JWTs, passwords, email, chat/question bodies or full prompts. Structured logs contain requestId/loungeId/event type/timing/outcome and sanitized generated-output metadata. Explain sentiment and interaction collection to participants. Retention of 30 days is a proposal awaiting OQ-09; document export/deletion and backup expiration before expanding beyond private testing.

Keep `.env`, audio of uncertain rights, model caches and DB dumps out of Git. Include placeholders only in a future `.env.example`. Pin dependencies and lockfiles, scan secrets/dependencies in CI, and record reviewed exceptions. Back up database and asset manifest together; encrypt off-host backups and restrict restore credentials. Expose only reverse proxy publicly; DB and LLM bind private interfaces.

On suspected credential exposure: revoke refresh sessions, rotate signing/DB/provider secrets, invalidate affected sockets, inspect redacted logs and audit Git history; never paste secrets into an incident ticket. On unauthorized room mutation: freeze room, preserve event history and restore from verified state. Report vulnerabilities privately to the repository maintainer; no external security contact is invented here. Validate these controls with TEST-001, TEST-004, TEST-011 and TEST-012 in [testing](TESTING_STRATEGY.md).
