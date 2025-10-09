# Changelog

All notable changes to **CPython Patch PR Action** will be documented here.  
The project follows [Semantic Versioning](https://semver.org/) and adheres to the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

### Added

- GitHub Action scaffold with TypeScript build, lint, test, and bundling pipelines.
- Metadata inputs for `track`, `include_prerelease`, `paths`, `automerge`, `dry_run`,
  and optional external PR support.
- Version discovery modules covering CPython tag fetchers, python.org fallback,
  runner availability checks, track alignment, pre-release guard, and idempotence.
- Repo scanning engine with glob discovery, pattern matchers, dry-run summaries,
  targeted rewrite logic, and patch computation.
- Git automation utilities for branch creation, commits, and duplicate-safe pull
  requests via Octokit.
- Initial README, security, contributing, and roadmap documentation optimized for
  SEO and onboarding.

### Planned

- First tagged release (`v0.x`) once end-to-end automation is validated in sandbox repositories.
- Automated changelog updates during release workflows.
