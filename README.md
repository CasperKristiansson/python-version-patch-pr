# CPython Patch PR Action

Automate CPython patch updates across every Python version reference in your repo. This GitHub Action handles security maintenance, Python version management, and CI/CD automation without custom scripts.

> Star and watch to get updates. Try the quick start below.

## Why this Action

DevOps, SRE, platform, and Python maintainers need consistent runtimes without manual patching. This action:

* Finds pinned CPython versions everywhere you declare them.
* Resolves the latest stable patch and opens an evergreen PR.
* Minimizes diffs and noise. Adds auditability and easy rollbacks.
* Plays well with Renovate and Dependabot.

Keywords: GitHub Action, CPython patch updates, Python version management, automated dependency updates, CI/CD automation, security maintenance.

## Feature overview

* Cross-file detection: Dockerfiles, GitHub workflows, `.python-version`, `.tool-versions`, `runtime.txt`, `tox.ini`, `pyproject.toml`, `Pipfile`, Conda `environment.yml`, and more.
* Smart discovery: Pulls CPython tags from GitHub with python.org fallback. Checks GitHub runner availability. Pre-release guard on by default.
* Minimal rewrites: Targeted replacements that preserve image suffixes like `-slim` and `-alpine`. Dry-run summary before writes.
* Idempotent: Skips if already on latest and sets `skipped_reason=already_latest`.
* Branch and PR automation: Predictable branch name. Updates an existing PR or opens a new one via Octokit.
* External PR support: Emits outputs for `peter-evans/create-pull-request` when preferred.
* Automerge ready: Hook for label or merge after checks pass.
* Security keyword gate: Only upgrade if release notes include keywords such as `CVE` or `security`.
* Offline snapshots: Run without network using provided tag, runner, and release notes snapshots.
* CI matrix fan-out: Output a change matrix to scope targeted jobs.

## Quick start

1. Add a scheduled workflow.

   ```yaml
   name: CPython Patch Bot

   on:
     schedule:
       - cron: '0 9 * * 1' # every Monday
     workflow_dispatch:

   jobs:
     bump-python:
       runs-on: ubuntu-latest
       permissions:
         contents: write
         pull-requests: write
       steps:
         - uses: actions/checkout@v4
         - name: Bump CPython patch versions
           uses: casperkristiansson/python-version-patch-pr@v0
           with:
             track: '3.12'
             automerge: false
             dry_run: false
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

2. Review the PR. The action creates or updates `chore/bump-python-<track>` and opens a PR against the default branch.

3. Merge or enable automerge. Set `automerge: true` or wire your own automerge job.

## How it works

1. Scan repository for pinned CPython patch versions like `3.12.4` across supported files.
2. Discover latest patch for the selected `track` using GitHub tags with python.org fallback.
3. Enforce pre-release guard unless `include_prerelease: true`.
4. Compute minimal diffs and generate a branch and PR body.
5. If no change is needed, exit with `skipped_reason=already_latest`.

## Inputs

| Input                    | Required | Default               | Description                                                                             |
| ------------------------ | -------- | --------------------- | --------------------------------------------------------------------------------------- |
| `track`                  | false    | `3.13`                | CPython minor series to monitor (for example `3.12`).                                   |
| `include_prerelease`     | false    | `false`               | Allow `rc`, `a`, or `b` releases when determining the latest patch.                     |
| `paths`                  | false    | *(see default globs)* | Newline-separated glob patterns to scan.                                                |
| `automerge`              | false    | `false`               | Label or merge the bump PR once checks pass.                                            |
| `dry_run`                | false    | `false`               | Skip file writes and emit a change summary instead.                                     |
| `security_keywords`      | false    | *(empty)*             | Require at least one keyword to appear in release notes before upgrading.               |
| `use_external_pr_action` | false    | `false`               | Emit outputs for `peter-evans/create-pull-request` instead of using Octokit internally. |

**Default globs**

```
.github/workflows/**/*.yml
Dockerfile
**/Dockerfile
**/*.python-version
**/runtime.txt
**/pyproject.toml
```

## Outputs

| Output           | Description                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `new_version`    | Highest CPython patch identified during the run.                                                                           |
| `files_changed`  | JSON array of files rewritten.                                                                                             |
| `change_matrix`  | JSON object for `strategy.matrix` fan-out with entries `{ file, new_version }`.                                            |
| `skipped_reason` | Machine-readable reason when no PR is created (`already_latest`, `multiple_tracks_detected`, `pre_release_guarded`, etc.). |

## Usage patterns

### Dry-run preview

```yaml
- name: CPython bump preview
  uses: casperkristiansson/python-version-patch-pr@v0
  with:
    track: '3.11'
    dry_run: true
```

Prints file paths, line numbers, and `old -> new` replacements before committing.

### Pre-release guard override

```yaml
with:
  include_prerelease: true
```

### Security keyword gate

Only roll forward when release notes match keywords.

```yaml
with:
  security_keywords: |
    CVE
    security
```

When set, the action fetches GitHub release notes for the resolved tag (or uses `RELEASE_NOTES_SNAPSHOT`) and skips unless a keyword matches.

### External PR workflow (peter-evans)

```yaml
- name: Bump CPython patch versions
  id: bump_python
  uses: casperkristiansson/python-version-patch-pr@v0
  with:
    use_external_pr_action: true

- name: Create PR with peter-evans
  uses: peter-evans/create-pull-request@v6
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    branch: ${{ steps.bump_python.outputs.branch }}
    title: ${{ steps.bump_python.outputs.title }}
    body: ${{ steps.bump_python.outputs.body }}
```

### Automerge guidance

Set `automerge: true` and attach your merge strategy in a follow-up job based on the action outputs.

### CI matrix fan-out

Drive targeted follow-up jobs using the `change_matrix` output.

```yaml
jobs:
  bump-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: bump
        uses: casperkristiansson/python-version-patch-pr@v0

  targeted-tests:
    needs: bump-python
    if: ${{ needs.bump-python.outputs.skipped_reason == '' }}
    strategy:
      matrix: ${{ fromJSON(needs.bump-python.outputs.change_matrix) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test -- ${{ matrix.file }}
```

### Renovate and Dependabot coexistence

Avoid competing PRs while keeping other automated dependency updates.

* `examples/coexistence/renovate.json` disables patch updates for the `python` base image and matching regex managers.
* `examples/coexistence/dependabot.yml` ignores semver patch updates for the `python` Docker image.

Both samples are validated by tests. Copy and adjust schedules or rules as needed.

### Offline mode

Run without network by providing snapshots and setting `NO_NETWORK_FALLBACK=true`.

* `CPYTHON_TAGS_SNAPSHOT`: JSON array of CPython tag objects.
* `PYTHON_ORG_HTML_SNAPSHOT`: Raw HTML or path to a saved python.org releases page.
* `RUNNER_MANIFEST_SNAPSHOT`: JSON manifest compatible with `actions/python-versions`.
* `RELEASE_NOTES_SNAPSHOT`: Map tags or versions to release note strings.

Each accepts inline data or a file path. Missing snapshots fail fast with a clear message.

## Example consumer repositories

See templates in [`examples/`](examples):

* [`examples/minimal`](examples/minimal): single-job workflow scheduled weekly.
* [`examples/guarded`](examples/guarded): dry-run preview with release-note gating and concurrency controls.

## Permissions

This workflow requires:

```yaml
permissions:
  contents: write
  pull-requests: write
```

## FAQ

**Multiple CPython tracks per run?**
No. If multiple `X.Y` tracks are detected, the run exits with `skipped_reason=multiple_tracks_detected`.

**Latest is a pre-release?**
Ignored unless `include_prerelease: true`.

**Updates other dependencies?**
No. This action focuses on CPython patch updates for predictability and auditability.

**Release history?**
See `CHANGELOG.md`.

## Roadmap and contributions

* Read `CONTRIBUTING.md` for local setup and standards.
* Open issues or PRs for edge cases and roadmap items.

## Security

Report security issues privately per `SECURITY.md`.

## License

MIT. See `LICENSE`.

> Like this Action? Star the repo. Adopt it in your org. Share feedback via issues or PRs.

GitHub Action for zero-maintenance CPython patch updates across your repo.
