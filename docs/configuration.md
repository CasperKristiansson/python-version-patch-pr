# Configuration Guide

This action exposes a compact public surface area, but each input interacts with the scanning, gating, and git subsystems. Use this guide when customizing deployments.

## Inputs

| Name                     | Type             | Default          | Details                                                                                                                                                                                                                |
| ------------------------ | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `track`                  | string           | `3.13`           | Minor CPython series to monitor. Must match `X.Y` as enforced by `src/config.ts`. Every detected pin is aligned to this track before upgrades proceed.                                                                 |
| `include_prerelease`     | boolean          | `false`          | Allow `a`, `b`, or `rc` tags when resolving the latest patch. Without it, `enforcePreReleaseGuard` blocks pre-releases even if GitHub tags exist.                                                                      |
| `paths`                  | multiline string | see `action.yml` | Glob patterns (relative to the workspace) that feed `fast-glob`. Use newline separation; blank lines are ignored. Patterns run in addition to the baked-in ignores (`**/node_modules/**`, `**/.git/**`, `**/dist/**`). |
| `automerge`              | boolean          | `false`          | Signals your workflows that it is safe to merge automatically after checks succeed. The action does **not** merge by itself; expose this flag to downstream jobs.                                                      |
| `dry_run`                | boolean          | `false`          | Skips file writes, commits, and PR work. Still emits the resolved `new_version` and file list so you can preview pending changes.                                                                                      |
| `security_keywords`      | multiline string | _(empty)_        | Requires at least one keyword to appear in CPython release notes before applying the bump. Release notes come from GitHub or `RELEASE_NOTES_SNAPSHOT`.                                                                 |
| `use_external_pr_action` | boolean          | `false`          | When `true`, the action behaves like a dry run: no workspace changes occur. This is useful when another workflow step handles file edits/PRs, but branch/title/body outputs are not yet emitted.                       |

### Hidden Behaviors

- When the scan finds workflow files (`.github/workflows/**`) and the provided token is not a classic PAT, the action refuses to modify those files and surfaces `workflow_permission_required`.
- The branch name is always `chore/bump-python-<track>`. Subsequent runs reuse it and replace its history with `--force-with-lease` to keep diffs minimal.

## Outputs

| Name             | Description                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `new_version`    | The selected CPython patch (e.g. `3.13.2`). Empty string if skipped earlier.                                                 |
| `files_changed`  | JSON array of files that would change (or did change). Never null.                                                           |
| `change_matrix`  | JSON object of the form `{ "include": [{"file": "path", "new_version": "3.13.2"}, ...] }`, intended for matrix fan-out jobs. |
| `skipped_reason` | Empty string when a change was applied; otherwise one of the `SkipReason` literals from `src/action-execution.ts`.           |

Use `fromJSON` in workflows to consume `change_matrix` and short-circuit follow-up jobs when it is empty.

## Environment Variables

| Variable                                                  | Purpose                                                                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`                                            | Required to read/write commits, fetch tags, create pull requests, and access release notes. Provide a PAT with `repo` + `workflow` scopes if the action must edit workflow files. |
| `GITHUB_WORKSPACE`                                        | Used to locate the repository root. Defaults to `process.cwd()` when absent (e.g., during local testing).                                                                         |
| `GITHUB_REPOSITORY`, `GITHUB_REF_NAME`, `GITHUB_BASE_REF` | Provide repository coordinates and default branch names. The action logs these values for traceability and falls back to `main` if none are set.                                  |
| `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`                     | Override the identity used for commits. When omitted, the action uses `GITHUB_ACTOR` or the standard `github-actions[bot]` noreply identity.                                      |
| `NO_NETWORK_FALLBACK`                                     | When `true`, every network touch point expects a companion snapshot. Missing snapshots throw informative errors before any changes occur.                                         |
| `CPYTHON_TAGS_SNAPSHOT`                                   | JSON array matching the shape returned by `fetchStableCpythonTags`. Useful in air-gapped runners.                                                                                 |
| `PYTHON_ORG_HTML_SNAPSHOT`                                | Raw HTML that mimics `https://www.python.org/downloads/source/`. Serves as the fallback dataset when GitHub tags are unavailable.                                                 |
| `RUNNER_MANIFEST_SNAPSHOT`                                | JSON equivalent of `versions-manifest.json` produced by `actions/python-versions`. Needed when runner availability cannot be checked over the network.                            |
| `RELEASE_NOTES_SNAPSHOT`                                  | JSON object mapping tag names or version strings (`"v3.13.2"`, `"3.13.2"`) to release note text for keyword gating.                                                               |

## Token & Permission Matrix

| Scenario                           | Required Scope                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Update regular files + open PR     | `contents: write`, `pull-requests: write` (default `GITHUB_TOKEN`).                                                         |
| Update `.github/workflows/**`      | Personal access token with `repo` + `workflow`. Set it as `GITHUB_TOKEN`.                                                   |
| Read private forks from a schedule | Same as above, but ensure the workflow runs in a context with `read/write` workflow permissions (Org → Settings → Actions). |

## Customizing Scan Targets

- Append extra patterns (e.g., `**/env.dockerfile`, `**/Pipfile.lock`) via the `paths` input. Blank lines are ignored.
- To exclude vendor directories beyond the defaults, add `!vendor/**` or similar at the end of the `paths` block.
- The scanner does not follow symlinks by default. This avoids infinite loops when repos vendor themselves. If you need it, fork the action and set `followSymbolicLinks: true` in `src/action-execution.ts` (or open a feature request).

## Multi-Track Repositories

The action intentionally fails (`multiple_tracks_detected`) when it sees more than one minor (e.g., `3.11.x` and `3.12.x`). Run separate jobs with distinct `paths` subsets and `track` values if your repo purposely pins multiple versions.

## Security Keyword Gate

Provide newline-separated keywords (case-insensitive) to require evidence in release notes before bumping:

```yaml
with:
  security_keywords: |
    CVE
    security fix
```

Release notes are fetched in this priority order:

1. `RELEASE_NOTES_SNAPSHOT`
2. GitHub release body for the resolved tag (requires network)

If neither source is available or no keyword matches, the job exits with `skipped_reason=security_gate_blocked`.

## Runner Availability Enforcement

`fetchRunnerAvailability` validates that the requested patch is present on Windows, macOS, and Linux hosted runners. When a platform is missing, the action exits with `skipped_reason=runners_missing` and lists the missing platforms. Override this behavior only if you control all runner OSes downstream.

## External Pull Request Mode (Experimental)

Setting `use_external_pr_action=true` currently:

- Returns the same payload as a dry run (no file edits, no branch).
- Still sets `new_version`, `files_changed`, and `change_matrix` outputs.
- Is useful for inventory-style jobs or when another system handles editing.

Branch, title, and body outputs are not yet emitted. Until then, keep this flag `false` if you expect the action to commit changes itself.
