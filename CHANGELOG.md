# CHANGELOG

## [Unreleased]

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
