# CHANGELOG

## [Unreleased]

### Fixed
- **SVN Bridge**: Fixed broken path extraction heuristic in `extractPath` for Spanish natural language queries.
- **SVN Bridge**: Replaced silent failures with "fail-loud" logic, injecting descriptive error messages into the context to prevent AI hallucinations when data retrieval fails.
- **SVN Bridge**: Improved intent detection and path extraction with a multi-pass approach (file extensions, multi-segment paths, trigger words, and capitalized acronym exclusions).

Todas las actualizaciones notables de Hypenosys se documentarán en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---
