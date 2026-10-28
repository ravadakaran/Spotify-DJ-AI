# Track selection enhancement — 28 October 2026

The user authorized starting the improvements roadmap. This first slice implements loaded-catalog search for IMP-001 in starting-track, Next Up and Soundclash forms. The shared TrackPicker searches title/artist case-insensitively, uses native select semantics and form validation, retains a selected track when filters change, and shows known artist, duration, asset availability and acoustic facts. Missing facts remain unknown. An audio asset does not certify provenance or reuse rights.

Search is local to the catalog already loaded by the application (at most the first 100 tracks); the picker states the loaded count and explicitly warns at the page limit. Full-catalog pagination, loading/retry controls and broader catalog search remain pending IMP-001 work. Existing catalog-loading errors continue through the application error handling. Selection does not imply immediate-segue eligibility. IMP-002 requires server-derived reasons and current-profile revalidation and is not implemented by this slice.

The shared component changes presentation only. Existing create, queue and battle payloads, identity, permissions, revisions, hard eligibility checks and socket names remain unchanged. No schema, index, migration, dependency or persistence change is required. No private assets, credentials or running services were changed.

Browser coverage adds empty search, narrowed title results, retained selection after filtering, and an overview screenshot. The existing two-context journey continues through queue/battle selection and mobile overflow/accessibility checks. The browser harness now permits Vite to try another port when the existing development app occupies 5173; the initial verification failed before executing the journey because strictPort was inherited from the development configuration.

Validation on the existing Windows / Node v24.13.0 host:

- `npm run lint`: passed after implementation.
- `npm run build`: passed after implementation.
- `npm test`: 49 tests across 11 suites passed, including concurrency/replay/RBAC.
- `npm run test:e2e`: final run passed (47.2-second journey, 54.9-second overall run), including added picker checks and existing two-context/mobile/accessibility journey. After the initial port failure, an intermediate run reached mobile playback but Pause was rejected with the existing stale-revision error; a rerun passed. This does not establish that the revision race is resolved.
- `git diff --check`: passed. Impeccable detector on TrackPicker returned no findings.
- Visually reviewed the rendered desktop picker screenshot, `evidence/enhancement-track-picker.png`; automated mobile overflow/accessibility checks passed. No screen-reader certification or new performance benchmark is claimed.

The full server suite rewrote its disposable restore evidence; the tracked historical restore report was restored. Existing legal media, real-model, independent evaluation and deployment gates remain open.
