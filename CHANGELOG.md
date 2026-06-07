# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and
Semantic Versioning.

## [Unreleased]

### Added

- Jungle Grid template and Qwen/Ollama worker modes.
- Managed research, scoring, validation, and draft artifacts.
- Internal draft review dashboard.
- Suppression/blocklist support before provider sends.

### Changed

- Local mode now uses deterministic templates.
- Replaced Gmail draft integration with ZeptoMail manual-approval sending.

### Fixed

- Artifact and provider-send validation fail closed.

### Removed

- Gmail OAuth and Gmail API draft integration.

### Security

- Removed hosted model credentials and network provider clients.
- Manual approval required before ZeptoMail send.
- Suppression/blocklist support added.

## [0.1.0] - 2026-06-06

### Added

- Initial open-source MVP with local template mode, dashboard, and safety controls.
