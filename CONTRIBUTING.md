# Contributing

Begin with [requirements](docs/PROJECT_REQUIREMENTS.md), [decisions](docs/DECISIONS.md), [implementation status](docs/IMPLEMENTATION_STATUS.md) and the relevant [task](docs/TASKS.md). Application implementation is authorized; the foundation is available. Preserve the unresolved media/model gates and do not represent the walking skeleton as the complete PRD.

Use short-lived `feat/TASK-xxx-description`, `fix/TASK-xxx-description` or `docs/description` branches; keep main reviewable. Commit small working increments with `feat:`, `fix:`, `test:` or `docs:` subjects and task IDs in the body. No remote repository, CI or branch protection exists yet; establish them in TASK-004 instead of assuming them.

Selected plan uses JavaScript ES modules, React function components, runtime request validation and JSDoc for domain contracts. Pin formatting/lint rules in Phase 1. Keep reducers, matcher and ranker pure; isolate HTTP/socket/persistence/model adapters. Never duplicate business rules between controllers and socket handlers. Use UTC timestamps and server-derived identity/time; use stable IDs rather than display names as keys.

Before opening a PR, run applicable lint/unit/integration checks and describe actual results. Link REQ/TASK IDs, explain behavior and error/recovery impact, update API/schema/docs when contracts change, and attach relevant sanitized evidence. Do not claim unrun tests passed. Changes to acoustic eligibility require exhaustive boundary/key tests; changes to room state require concurrency/replay/resync tests; changes to authorization require cross-role and cross-room denials. Avoid tests that merely repeat implementation details.

Reviewers check source fidelity, atomic state transitions, hard eligibility, room-scoped access, bounded resource use, factual grounding, data provenance and migrations/rollback. Prefer one feature slice per PR. Do not add libraries/microservices or change stack because of incidental convenience; update decisions with the reason first. Lockfiles and reviewed dependency versions belong in source control; secrets, local DB dumps, model weights and unlicensed audio do not.

Final submission requires a clean-install walkthrough, measured performance/evaluation evidence, multi-session demo, actual API reference and retrospective. New optional work belongs after TASK-027 and needs a clear requirement. Report security issues privately to the repository maintainer; there is no invented reporting address.
