# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-02-01

### Added

- **VpsProduct**: New fields `arch`, `cpuModel`, `dedicated`, `backupPrice`, `snapshotPrice`, `speed`, `location`
- **ServerInfo**: New fields `expireAt`, `term`, `price`, `rdns`, `cpu`, `ram`, `diskSize`, `cpuModel`, `disabled`
- **Snapshot**: New fields `userId`, `serverId`, `expirationDate`, `active`, `disabled`, `isProtection`, `price`
- **IpInfo**: New type for IP address management
- **Backup**: New type for backup management
- **Iso**: New type for ISO image management

#### New API Methods

- `resetPassword(serverId)` - Reset root password via rescue mode
- `cancelServer(serverId)` - Schedule server cancellation
- `uncancelServer(serverId)` - Remove cancellation
- `renameServer(serverId, name)` - Rename a server
- `changeBillingCycle(serverId, cycle)` - Change billing cycle
- `enableProtection(serverId)` / `disableProtection(serverId)` - Server protection
- `getAvailableUpgrades(serverId)` / `processUpgrade(serverId, plan, type)` - Server upgrades
- `listIps(serverId)` / `orderIp(serverId, type)` / `deleteIp(serverId, ipId)` - IP management
- `updateIpRdns(serverId, ipId, rdns)` / `resetIpRdns(serverId, ipId)` - RDNS management
- `listIsos(serverId)` / `mountIso(serverId, isoId)` / `unmountIso(serverId)` - ISO management
- `listBackups(serverId)` / `enableBackups(serverId)` / `disableBackups(serverId)` - Backup config
- `deleteBackup(serverId, backupId)` / `restoreBackup(serverId, backupId)` - Backup operations
- `getBackupStatus(serverId, upid)` - Track backup/restore progress

#### New CLI Commands

- `sg-deploy cancel --server-id <id>` - Cancel server
- `sg-deploy uncancel --server-id <id>` - Uncancel server
- `sg-deploy rename --server-id <id> --name <name>` - Rename server
- `sg-deploy reset-password --server-id <id>` - Reset root password
- `sg-deploy protection --server-id <id> --action <enable|disable>` - Server protection
- `sg-deploy ips --server-id <id> [--order <ipv4|ipv6>] [--delete <ipId>]` - IP management
- `sg-deploy backups --server-id <id> [--enable] [--disable] [--restore <id>] [--delete <id>]` - Backup management
- `sg-deploy isos --server-id <id> [--mount <id>] [--unmount] [--search <query>]` - ISO management
- `sg-deploy upgrade --server-id <id> [--list] [--plan <plan> --type <nodisk|disk>]` - Upgrades

#### Enhanced CLI Products Command

- Now displays CPU architecture (`arch`), CPU model
- Filter by architecture: `--arch arm64`
- Filter by location: `--location NL`
- Filter by max price: `--max-price 10`
- JSON output: `--json`
- Sorted by price ascending

### Fixed

- **rebuildServer()**: Changed parameter from `osImage` to `image` to match API spec
- **setReverseDns()**: Changed endpoint from `/rdns` to `/rdns/edit` and parameter from `hostname` to `rdns`

### Changed

- Full alignment with OpenAPI spec at https://api.servers.guru/openapi.yaml
- Snapshot mapping now correctly transforms snake_case API fields to camelCase

## [1.1.1] - 2026-01-31

### Fixed

- Aligned test mocks with Servers.guru OpenAPI specification
- Updated tests for orderVps polling and power action values

## [1.1.0] - 2026-01-31

### Fixed

- **getProducts()**: Handle object format `{"FI1-1": {...}}` instead of array
- **listServers()**: Handle `{"Servers": [...]}` format instead of wrapped data
- **getServerStatus()**: Handle direct `{"status": "running"}` format
- **orderVps()**: Handle `{"success": true}` without server details; now polls for new server
- **powerAction()**: Use correct `powerType` values ("on"/"off"/"reboot")

### Changed

- Major API compatibility fix for Servers.guru actual response formats

## [1.0.4] - 2026-01-31

### Fixed

- Fixed balance API response parsing (handle both direct and wrapped formats)

## [1.0.3] - 2026-01-31

### Added

- Generic `${VAR}` environment variable substitution in YAML config files
- All config values now support `${ENV_VAR}` syntax (e.g., `dockerImage: "ghcr.io/${GITHUB_REPOSITORY}:latest"`)

### Changed

- Environment variable substitution now happens before specific overrides

## [1.0.2] - 2026-01-31

### Changed

- Updated CHANGELOG dates for npm publication

## [1.0.1] - 2026-01-31

### Fixed

- Minor bug fixes and improvements

## [1.0.0] - 2026-01-30

### Added

- Initial release
- VPS deployment automation
- SSH provisioning
- Docker deployment
- SSL certificate automation
- Snapshot-based rollback
- Health verification
- CLI tool

[Unreleased]: https://github.com/0xjacq/serversguru-deploy/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/0xjacq/serversguru-deploy/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/0xjacq/serversguru-deploy/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.4...v1.1.0
[1.0.4]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/0xjacq/serversguru-deploy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/0xjacq/serversguru-deploy/releases/tag/v1.0.0
