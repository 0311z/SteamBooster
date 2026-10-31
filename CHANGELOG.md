# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- WebUI dashboard
- Multi-language support
- Advanced statistics graphs
- Account groups/profiles

## [3.0.0] - 2025-11-23

### Added
- **Security**: Credential encryption with AES-256-GCM
- **Security**: Input validation and sanitization
- **Security**: Prototype pollution protection
- **Security**: Rate limiting and backoff strategies
- **Features**: Invisible boosting mode
- **Features**: QR/App login support (FIXED - now working!)
- **Features**: State persistence and recovery
- **Features**: Automatic backups with rotation
- **Features**: PM2 production support
- **Features**: Docker containerization
- **Monitoring**: Health checks and metrics
- **Monitoring**: Error detection and auto-pause
- **CI/CD**: GitHub Actions workflows
- **CI/CD**: Automated testing and security scans
- **Docs**: Complete documentation overhaul
- **Docs**: SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
- **Docs**: BUGFIXES.md with all resolved issues

### Changed
- Complete architecture rewrite
- Improved error handling throughout
- Better logging with structured format
- Enhanced UI with fixed-width design
- Optimized concurrency for multiple accounts

### Fixed
- **UI**: ASCII table now supports 9+ items with pagination
- **UI**: Long usernames (30+ chars) display correctly with truncation
- **UI**: Random "?" characters replaced with ASCII equivalents
- **Auth**: QR login now functional (scan QR or approve in app)
- **Stats**: Statistics page completely rewritten, no more crashes
- **Menu**: Fixed false "boosting active" state (proper state tracking)
- **Settings**: Save operations work correctly, no more freezing
- **Input**: Password input supports 64+ characters with backspace
- **Memory**: Memory leaks in long-running sessions fixed
- **Encoding**: UTF-8 encoding issues resolved

### Security
- Dependency updates and vulnerability fixes
- Secure file permissions enforcement
- Secrets removed from code
- Environment variable support

## [2.0.0] - 2025-11-20

### Added
- Multi-account support
- 2FA/Steam Guard support
- Statistics tracking
- Message logging
- Auto-reply feature

### Changed
- Migrated to JSON configuration
- Improved error messages
- Better Steam API handling

### Fixed
- Login timeout issues
- Configuration loading bugs

## [1.0.0] - 2025-11-18

### Added
- Initial release
- Basic hour boosting functionality
- Single account support
- Manual 2FA code entry

---

## Release Types

- **Major** (X.0.0): Breaking changes
- **Minor** (0.X.0): New features (backward compatible)
- **Patch** (0.0.X): Bug fixes

## Links


- [Compare v3...pre-release](https://github.com/stolenact/vaporbooster/compare/v3...pre-release)
- [Compare v2...pre-release](https://github.com/stolenact/vaporbooster/compare/v2...pre-release)