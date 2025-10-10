# Changelog

All notable changes to **CPython Patch PR Action** will be documented here.  
The project follows [Semantic Versioning](https://semver.org/) and adheres to the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

- Nothing yet.

## [1.4.0] - 2025-10-10

### Added

- Push the generated `chore/bump-python-<track>` branch before creating the pull request so the GitHub API accepts the head reference.
- Apply resolved patch versions to the working tree automatically when not in dry-run mode, preserving the minimal diff behaviour.

### Fixed

- Documented the repository-level workflow permission toggle required for PR creation.

## [1.3.0] - 2025-10-10

- Detect the default branch correctly even when `GITHUB_BASE_REF` is present but empty in scheduled workflows.

## [1.2.0] - 2025-10-10

### Fixed

- Allow default runs to create pull requests again instead of always behaving like a dry-run.

## [1.1.0] - 2025-10-10

### Fixed

- Fixed packaging so the published action includes the bundled `dist/index.js` entrypoint again.
- Documented the requirement to rerun `npm run bundle` and commit the compiled assets when changing runtime code.

## [1.0.0] - 2025-10-09

### Added

- First official, production-ready release of the CPython Patch PR Action.
- Comprehensive repository scanner covering GitHub workflows, Dockerfiles, `.python-version`, `.tool-versions`, `runtime.txt`, `pyproject.toml`, `Pipfile`, Conda `environment.yml`, `tox.ini`, and more.
- Rewrite engine that computes minimal diffs, preserves suffixes (e.g. `-slim`), supports dry-run previews, and ensures idempotent reruns.
- Version resolution pipeline combining GitHub tag discovery, python.org fallback, runner availability verification, track alignment, and configurable pre-release guard.
- Git automation that creates or reuses `chore/bump-python-<track>` branches, commits file updates, and opens or updates pull requests with detailed bodies and rollback instructions.
- Security keyword gating that inspects CPython release notes before applying upgrades, with offline snapshot support for air-gapped environments.
- Outputs for downstream automation, including `files_changed`, `new_version`, `skipped_reason`, and the `change_matrix` JSON for CI matrix fan-out.
- Cross-platform compatibility through normalized path handling and Windows coverage in the continuous integration workflow.
