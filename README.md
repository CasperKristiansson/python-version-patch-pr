# CPython Patch PR Action

CPython Patch PR Action is a GitHub Action that automatically scans your repository for pinned CPython patch versions (e.g. `3.12.4`) and opens an evergreen pull request whenever a new patch release is available. It keeps Dockerfiles, GitHub workflows, `.python-version`, `pyproject.toml`, `runtime.txt`, `Pipfile`, Conda environment files, and more aligned with the latest stable runtime—helping teams maintain secure, up-to-date Python environments without custom automation.

---

## Quick start

1. **Add the workflow**

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

2. **Review the pull request** – When a patch release appears, the action creates (or updates) `chore/bump-python-<track>` with all replacements and opens a PR against your default branch.

3. **Merge or enable automerge** – Set `automerge: true` if you want the action (or a follow-up workflow) to merge after checks succeed.

---

## Highlights

- 🔍 **Cross-file detection:** Finds pinned CPython versions in Dockerfiles, GitHub Actions workflows, `.python-version`, `.tool-versions`, `runtime.txt`, `tox.ini`, `pyproject.toml`, `Pipfile`, Conda `environment.yml`, and more.
- 🧠 **Smart discovery:** Pulls CPython tags from GitHub, falls back to python.org, checks GitHub runner availability, and enforces a pre-release guard by default.
- ✏️ **Minimal rewrites:** Calculates targeted replacements, preserves suffixes (e.g. `-slim`, `-alpine`), and emits a dry-run summary before writing.
- 🔁 **Idempotent runs:** Detects when everything is already on the latest patch and sets `skipped_reason=already_latest` to avoid noisy PRs.
- 🌿 **Branch + PR automation:** Creates a consistent branch name, commits changes, and either updates an existing PR or opens a new one via Octokit.
- 🔌 **External PR support:** Optionally emit metadata for `peter-evans/create-pull-request` if you prefer that workflow.
- 🤖 **Automerge ready:** Honor the `automerge` flag by labeling or merging once checks pass (implementation hook provided).

---

## Inputs

| Input                    | Required | Default               | Description                                                                             |
| ------------------------ | -------- | --------------------- | --------------------------------------------------------------------------------------- |
| `track`                  | false    | `3.13`                | CPython minor series to monitor (e.g. `3.12`).                                          |
| `include_prerelease`     | false    | `false`               | Allow `rc`, `a`, or `b` releases when determining the latest patch.                     |
| `paths`                  | false    | _(see default globs)_ | Newline-separated glob patterns to scan.                                                |
| `automerge`              | false    | `false`               | Label or merge the bump PR once checks pass.                                            |
| `dry_run`                | false    | `false`               | Skip file writes and emit a change summary instead.                                     |
| `security_keywords`      | false    | _(empty)_             | Require the release notes to contain at least one of the provided keywords before upgrading. |
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

---

## Outputs

| Output           | Description                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `new_version`    | Highest CPython patch identified during the run.                                                                           |
| `files_changed`  | JSON array of files rewritten.                                                                                             |
| `change_matrix`  | JSON object suitable for `strategy.matrix` fan-out (entries contain `file` and `new_version`).                             |
| `skipped_reason` | Machine-readable reason when no PR is created (`already_latest`, `multiple_tracks_detected`, `pre_release_guarded`, etc.). |

---

## Advanced configuration

### Dry-run previews

```yaml
- name: CPython bump preview
  uses: casperkristiansson/python-version-patch-pr@v0
  with:
    track: '3.11'
    dry_run: true
```

The action prints a summary listing file paths, line numbers, and `old -> new` replacements so you can see the impact before committing.

### Pre-release guard override

Keep release candidates out of production by default. Opt in when you intentionally want `rc`/alpha/beta builds:

```yaml
with:
  include_prerelease: true
```

### External PR workflow

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

Set `automerge: true` and wire a follow-up job that applies your preferred automerge strategy (label-based, direct merge, etc.) based on the outputs emitted by the action.

### Security keyword gate

Supply `security_keywords` (one per line) to require matching terms inside the CPython release notes before applying an update. This is useful for only auto-rolling releases that contain security fixes:

```yaml
with:
  security_keywords: |
    CVE
    security
```

When the keywords are provided, the action fetches the GitHub release notes for the resolved tag (or uses the optional `RELEASE_NOTES_SNAPSHOT` offline input) and skips the run unless at least one keyword is present.

### Matrix fan-out for CI

Use the `change_matrix` output to drive follow-up jobs that need to iterate over the files touched by the upgrade:

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

Each matrix entry exposes `matrix.file` and `matrix.new_version`, enabling you to scope lint or test jobs to the files rewritten during the patch.

### Renovate/Dependabot coexistence

If Renovate or Dependabot also try to bump CPython patch versions, they will race with this action
and open competing pull requests. Use the sample configurations below to disable CPython patch bumps
while still allowing those tools to manage other dependencies:

- `examples/coexistence/renovate.json` disables patch updates for the `python` base image in Dockerfiles
  and any custom regex managers that match CPython pins.
- `examples/coexistence/dependabot.yml` ignores semver patch updates for the `python` Docker image
  while keeping other ecosystems enabled.

Both samples are validated by the test suite so you can copy them verbatim and adjust schedules or
additional dependency rules as needed.

---

## Example consumer repositories

Clone one of the templates in [`examples/`](examples) to see the action running in
the context of a real repository:

- [`examples/minimal`](examples/minimal) – single-job workflow scheduled weekly.
- [`examples/guarded`](examples/guarded) – dry-run preview with release-note
  gating and concurrency controls.

Each template ships with a README snippet and status badge you can adapt when
bootstrapping your own public showcase repository.

### Offline mode

Set `NO_NETWORK_FALLBACK=true` and supply snapshots so the action can run without hitting
external endpoints:

- `CPYTHON_TAGS_SNAPSHOT` – JSON array of CPython tag objects.
- `PYTHON_ORG_HTML_SNAPSHOT` – Raw HTML or path to a saved python.org releases page.
- `RUNNER_MANIFEST_SNAPSHOT` – JSON manifest compatible with `actions/python-versions`.
- `RELEASE_NOTES_SNAPSHOT` – JSON object mapping tags or versions to release note strings.

Each variable accepts either the data directly or a path to a file containing the snapshot. When
offline mode is enabled and a snapshot is missing, the run will fail fast with a clear message.

---

## Permissions

The workflow requires:

```yaml
permissions:
  contents: write
  pull-requests: write
```

Without these scopes, the action cannot push branches or manage pull requests.

---

## Frequently asked questions

**Does it support multiple CPython tracks per run?**  
No. If the scan finds multiple `X.Y` tracks, the run exits with `skipped_reason=multiple_tracks_detected` so you can investigate.

**What if the latest release is a pre-release?**  
Pre-releases are ignored unless you set `include_prerelease: true`. The guard protects production workflows from accidental RC bumps.

**Can it update other dependencies?**  
The action is laser-focused on CPython patch updates to stay predictable, fast, and audit-friendly.

**How do I see progress?**  
Check `CHANGELOG.md` for release history and upcoming highlights.

---

## Getting involved

- Review `CONTRIBUTING.md` for setup instructions and coding standards.
- Open issues or PRs if you spot edge cases or want to collaborate on roadmap tasks.
- Report security issues privately as described in `SECURITY.md`.

---

## License

Released under the MIT License. See `LICENSE` for details.
