# Architecture

The CPython Patch PR Action is implemented as a TypeScript GitHub Action (CommonJS build) whose runtime entry point is `src/index.ts`. The codebase follows a dependency-injected architecture so core logic can be exercised in isolation via Vitest.

## High-Level Flow

1. **Input + environment normalization** – `src/index.ts` resolves action inputs, environment variables, and offline snapshots, then constructs the `ExecuteOptions` bag.
2. **Orchestration** – `executeAction` in `src/action-execution.ts` coordinates scanning, version discovery, gating, rewriting, and (optionally) git + PR operations. External services are passed in through the `ExecuteDependencies` interface.
3. **Scanning** – `scanForPythonVersions` (`src/scanning/scanner.ts`) expands glob patterns, reads files, and applies pattern detectors to collect every pinned `X.Y.Z` reference along with file/line/column metadata.
4. **Decision gates** – `determineSingleTrack`, `resolveLatestPatch`, `fetchLatestFromPythonOrg`, `enforcePreReleaseGuard`, `fetchRunnerAvailability`, and the optional `security_keywords` check determine whether an update should proceed and which version to target.
5. **Rewrite + dry-run** – Version matches are grouped per file and rewritten in-memory (`applyVersionUpdates`) using the same pattern logic from `src/rewriter`. When `dry_run` or `use_external_pr_action` is enabled, the action exits before touching the workspace after emitting the change summary.
6. **Git + PR automation** – When allowed, `src/git/branch.ts` creates (or fast-forwards) `chore/bump-python-<track>`, stages targeted files, commits, pushes with `--force-with-lease`, and `src/git/pull-request.ts` uses Octokit + throttling to create or update the pull request. `src/pr-body.ts` renders the pull request template and embeds workflow permission warnings.

## Module Breakdown

### Input Surface

- `src/config.ts` validates the `track` input with zod to prevent misconfigured minors.
- `resolvePathsInput`, `resolveSecurityKeywords`, and snapshot loaders inside `src/index.ts` normalize user-provided multiline inputs and optional offline fixtures (`CPYTHON_TAGS_SNAPSHOT`, `PYTHON_ORG_HTML_SNAPSHOT`, `RUNNER_MANIFEST_SNAPSHOT`, `RELEASE_NOTES_SNAPSHOT`).
- `parseRepository` defends against malformed `GITHUB_REPOSITORY` values so the action can still run in forks/local contexts.

### Scanning + Pattern System

- `discoverFiles` (`src/scanning/glob-discovery.ts`) wraps `fast-glob` with default ignores (`node_modules`, `.git`, `dist`).
- `pythonVersionPatterns` (`src/scanning/patterns/python-version.ts`) is a curated set of detectors for GitHub workflow YAML, Dockerfiles, `.python-version`, `.tool-versions`, `runtime.txt`, `pyproject.toml`, `tox.ini`, `Pipfile`, and Conda `environment.(yml|yaml)`. Each pattern defines `isFileSupported` to avoid unnecessary regex work.
- `findPythonVersionMatches` enforces `X.Y.Z` shape, captures track metadata, guards against `X.Y.Z.W` false positives, and records a byte index used later for precise rewrites.
- `determineSingleTrack` (`src/scanning/track-alignment.ts`) ensures all matches live on a single `X.Y` minor before proceeding. Conflicts bubble up as a skip reason.

### Version Resolution

- `resolveLatestPatch` (`src/versioning/latest-patch-resolver.ts`) prefers GitHub tags for accuracy and returns `{version, tagName, commitSha}`. It reuses `fetchStableCpythonTags` from `src/github/cpython-tags.ts`, which streams paginated tags and filters out pre-releases using semver.
- `fetchLatestFromPythonOrg` (`src/versioning/python-org-fallback.ts`) scrapes python.org release listings as a backup when GitHub data is missing or offline snapshots are provided.
- `enforcePreReleaseGuard` rejects `rc`, `a`, or `b` builds unless `include_prerelease` is true.
- `fetchReleaseNotes` (`src/versioning/release-notes.ts`) pulls the GitHub release body for the resolved tag so `security_keywords` can gate the upgrade.
- `fetchRunnerAvailability` (`src/versioning/runner-availability.ts`) loads the canonical `actions/python-versions` manifest (or a snapshot) and ensures Ubuntu, macOS, and Windows runners all publish the requested patch.

### Rewrite + Idempotence

- `applyVersionUpdates` in `src/action-execution.ts` performs in-place replacements by walking matches in reverse index order.
- The `src/rewriter` module also exposes `computePatch`, `runDryRun`, and `evaluateIdempotence` for future CLI usage and is exercised directly in `tests/patch.test.ts`, `tests/dry-run.test.ts`, and `tests/idempotence.test.ts`.

### Git + Pull Requests

- Branch management is encapsulated in `src/git/branch.ts`. The helper stages only targeted files, reuses existing branches, and respects custom git author identity via environment overrides.
- `src/git/pull-request.ts` centralizes Octokit usage with the throttling plugin to gracefully retry on rate limits. Both listing (idempotence) and create/update code paths share this client.
- `generatePullRequestBody` (`src/pr-body.ts`) emits a deterministic Markdown body detailing files changed, workflow permission warnings, and rollback instructions.

### Dependency Injection Layer

`executeAction` receives a `dependencies` object so tests (and future alternative entry points) can replace any external integration (file IO, network calls, Octokit). Production runs build this via `buildDependencies()` in `src/index.ts`.

## Offline & Snapshot Mode

The action can operate without outbound network access by providing snapshots through environment variables:

- `CPYTHON_TAGS_SNAPSHOT` – JSON array of `{tagName, version, commitSha}` objects used by `resolveLatestPatch`.
- `PYTHON_ORG_HTML_SNAPSHOT` – HTML blob fed to the python.org fallback parser.
- `RUNNER_MANIFEST_SNAPSHOT` – JSON manifest mirroring `actions/python-versions`.
- `RELEASE_NOTES_SNAPSHOT` – object mapping tag or version strings to release note text.
- `NO_NETWORK_FALLBACK=true` – forces every dependency to rely solely on the snapshots and surfaces explicit errors when a required snapshot is missing.

## Skip Reasons & Guardrails

`executeAction` returns either `SuccessResult` or `SkipResult`. Skip reasons map 1:1 with user-facing log statements and the troubleshooting guide:

- `no_matches_found`, `multiple_tracks_detected`
- `pre_release_guarded`, `security_gate_blocked`
- `runners_missing`, `workflow_permission_required`
- `already_latest`
- `pr_exists`, `pr_creation_failed`

Each skip attaches structured `details` so downstream jobs can branch on `skipped_reason` or inspect JSON logs.

## External PR Mode Caveat

Setting `use_external_pr_action=true` currently short-circuits after the scan and returns a dry-run style response without touching the workspace. This is useful for inspection jobs but does **not** yet emit branch/title/body outputs. Do not enable it if you rely on this action to author commits.
