# Project Context Overview

This document captures the current state of the **CPython Patch PR Action** repository, the key
capabilities that have been implemented so far, and any manual configuration that enables the
nightly workflows to run end-to-end.

---

## Action capabilities

- **Version detection**
  - GitHub tag fetcher with python.org fallback.
  - Runner availability validation against `actions/python-versions`.
  - Pre-release guard (opt-in via `include_prerelease`).
  - Track alignment + idempotence helpers.
- **Scanning & rewriting**
  - Globs for common Python version files.
  - Regex matchers covering workflows, Dockerfiles, runtime files, `pyproject.toml`, `Pipfile`,
    Conda `environment.yml`, etc.
  - Dry-run summaries and targeted patch computation that preserves Docker suffixes.
- **Git / PR integration**
  - Branch+commit helper (`chore/bump-python-<track>`).
  - Pull-request helper with Octokit throttling & duplicate-PR prevention.
- **Testing & coverage**
  - Vitest suite with >90% coverage (run `npm run test -- --coverage`).
  - Git-based integration tests using temporary repositories.
- **Documentation & metadata**
  - README with SEO-friendly quick start and advanced configuration.
  - CHANGELOG (Keep a Changelog format).
  - SECURITY policy outlining required permissions and endpoints.

---

## GitHub workflows

### `.github/workflows/fixtures.yml`
Runs the action in **dry-run** mode against local fixtures:

- CI jobs: install, build (`npm run build`), bundle (`npm run bundle`), then `uses: ./` with
  `dry_run: true`.
- Fixture matrix (`fixtures/basic`, `fixtures/workflow`) ensures core scanners stay stable.
- No secrets required (read-only `GITHUB_TOKEN` is sufficient).

### `.github/workflows/nightly.yml`
Weekly **Monday 03:00 UTC** E2E run against a sandbox repository:

- Builds/bundles this repo.
- Clones the sandbox repo and executes the action in non-dry-run mode (`dry_run: false`).
- Writes a summary containing repository, branch, track, automerge flag, files changed,
  and `skipped_reason`.
- Requires secrets and optional variables (see next section).

---

## Sandbox configuration

Set the following in **Settings → Secrets and variables → Actions**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `SANDBOX_REPO` | Secret | ✅ | Repo slug e.g. `username/python-sandbox`. |
| `SANDBOX_TOKEN` | Secret | ✅ | PAT with `contents: read/write` and `pull-requests: read/write` scopes for the sandbox repo. |
| `SANDBOX_TRACK` | Variable | Optional (`3.11` default) | CPython minor to track. |
| `SANDBOX_DEFAULT_BRANCH` | Variable | Optional (`main` default) | Branch to check out before running. |
| `SANDBOX_AUTOMERGE` | Variable | Optional (`false` default) | Pass-through to the action’s `automerge` input. |

### Sandbox repo content

Include deliberate CPython version pins (e.g. Dockerfile, `.github/workflows/*.yml`,
`runtime.txt`, `pyproject.toml`, `Pipfile`, `environment.yml`). A sample prompt for scaffolding
the sandbox is captured in the main discussion and can be reused to populate example files.

---

## Running locally

```bash
npm ci
npm run lint
npm run test -- --coverage
npm run bundle
node dist/index.js   # Placeholder run output
```

Use `node dist/index.js` to confirm the bundled action executes; currently it only logs
configuration and emits `skipped_reason: not_implemented`.

---

## Roadmap snapshot (docs/tasks.md)

Tasks 1–31 are marked complete, covering scaffolding, metadata, docs, scanning engine,
rewrite logic, branch/PR automation, dry-run workflows, sandbox nightly job, and Octokit
throttling. Task 32 onward focuses on bundling `dist/`, release workflows, CodeQL,
example consumer repos, and additional guardrails.

Refer to `docs/tasks.md` for the full list of upcoming work.

---

_Last updated: 2025-10-09_
