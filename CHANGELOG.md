# CHANGELOG

## [Unreleased]

### Fixed
- **Jules Panel chat and Claude supervision**: Preserve the reader's scroll position during polling and streaming, avoid rebuilding unchanged transcripts, and prevent reflected workspace broadcasts. Restore previously authorized Claude supervision after reload while preserving manual pauses, reviewed plan versions, decision limits and session isolation. Save review output to the current conversation after cross-tab refreshes, persist review errors, and display the actual supervision policy and limit.

### Fixed
- **Claude Neural Chat**: Preserve the in-flight conversation during cross-tab synchronization so Claude replies remain visible and persisted. Optional task-context preparation is bounded and failures before the provider are saved in the transcript. Keep message selection inside each bubble, visible and keyboard accessible, removing the floating hover artifact. Refresh the standalone script cache versions.

### Changed
- **HAIS market evidence (2026-11-03)**: Linked the tested China 10Y/Brent widget-only catalog fix and latest verified CI/deploy runs in the HAIS Kanban; real provider freshness and the protected gateway remain unverified. PAPER-only.

### Fixed
- **Jules integration and dev deployment**: Updated completion contracts to use the canonical Kanban `OK` state, verify exact task/session association and idempotence, and run Claude/Jules workspace checks before deployment.

### Changed
- **Neural workspaces**: Updated Claude and Jules with a purple segmented selector, development actions, a shared composer, task context and supervision cards. Jules now includes a session table with execution/history filters and an operational summary driven by existing session data.

### Added
- **HAIS-001 pilot bootstrap**: Added a 24-task dependency backlog, a PAPER-only validation script, CI contract checks and an onboarding runbook. No production secrets or trading permissions are enabled.

### Fixed
- **Command Center Access Control**: Centralized team access validation (`validateToken`) and role resolution (`isAdmin`) dynamically from `assets/data/team_profiles.json`, eliminating hardcoded whitelist arrays and allowing instant propagation of member role changes across the platform.

### Added
- **Multi-tenant Organizations**: Added support to dynamically select, switch, and create multiple organizations saved on GitHub under custom directory structures `_data/orgs/{orgId}/`.
- **Personal Kanban (Local Only)**: Integrated a completely separate personal workspace backed strictly by browser `localStorage` (`hy_personal_tasks`, `hy_personal_archive`, etc.) with identical field options, restricted user context mapping, and standalone fallback support.
- **Local Import/Export Tools**: Built client-side JSON serialization and schema validation tools to export and import personal Kanban workspaces directly through file input streams.

### Fixed
- **SVN Bridge**: Fixed broken path extraction heuristic in `extractPath` for Spanish natural language queries.
- **SVN Bridge**: Replaced silent failures with "fail-loud" logic, injecting descriptive error messages into the context to prevent AI hallucinations when data retrieval fails.
- **SVN Bridge**: Improved intent detection and path extraction with a multi-pass approach (file extensions, multi-segment paths, trigger words, and capitalized acronym exclusions).

Todas las actualizaciones notables de Hypenosys se documentarán en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---



