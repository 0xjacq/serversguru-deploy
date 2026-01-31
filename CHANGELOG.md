# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Structured error handling with actionable error codes
- Pre-flight validation checks before deployment
- Structured logging with sensitive data redaction
- CI/CD pipeline with GitHub Actions
- ESLint and Prettier configuration
- Husky pre-commit hooks
- Comprehensive API documentation
- Unit tests for SSH provisioner and orchestrator
- Integration tests with mock API server

### Changed

- Improved error messages with suggestions
- Enhanced CLI with JSON output support
- Updated package.json with exports field

## [1.0.4] - 2026-01-31

### Fixed

- Fixed balance API response parsing (handle both direct and wrapped formats)

## [1.0.3] - 2026-01-31

### Added

- Generic `${VAR}` environment variable substitution in YAML config files
- All config values now support `${ENV_VAR}` syntax (e.g., `dockerImage: "ghcr.io/${GITHUB_REPOSITORY}:latest"`)

### Changed

- Environment variable substitution now happens before specific overrides

## [1.0.2] - 2025-01-31

### Changed

- Updated CHANGELOG dates for npm publication

## [1.0.1] - 2025-01-31

### Fixed

- Minor bug fixes and improvements

## [1.0.0] - 2025-01-30

### Added

- Initial release
- VPS deployment automation
- SSH provisioning
- Docker deployment
- SSL certificate automation
- Snapshot-based rollback
- Health verification
- CLI tool

[Unreleased]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/0xjacq/serversguru-deploy/releases/tag/v1.0.0
