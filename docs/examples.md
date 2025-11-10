# Examples & Outputs

Use these scenarios to understand how the CPython Patch PR Action behaves end to end. They combine workflow snippets, sample repository files, log excerpts, and emitted outputs so you can adopt or debug quickly.

## 1. Minimal Repo Walkthrough

### Workflow Step

```yaml
- name: Bump CPython patch versions
  id: bump
  uses: casperkristiansson/python-version-patch-pr@v1
  with:
    track: '3.12'
    automerge: true
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Before & After (`Dockerfile`)

```dockerfile
# Before
FROM python:3.12.3-slim

# After
FROM python:3.12.5-slim
```

The scanner notices the pinned `3.12.3`, resolves `3.12.5`, and rewrites only the version substring—suffixes like `-slim` stay intact.

### Console Output Highlights

```
==> Configuration
track: 3.12
paths (6): .github/workflows/**/*.yml, Dockerfile, **/Dockerfile, **/*.python-version, **/runtime.txt, **/pyproject.toml
include_prerelease: false
automerge: true
dry_run: false

Resolved latest patch version: 3.12.5
Files that would change (1): Dockerfile
Pull request created: #42 (https://github.com/example/repo/pull/42)
```

### Step Outputs

```json
{
  "new_version": "3.12.5",
  "files_changed": ["Dockerfile"],
  "skipped_reason": "",
  "change_matrix": {
    "include": [
      { "file": "Dockerfile", "new_version": "3.12.5" }
    ]
  }
}
```

Use `fromJSON(steps.bump.outputs.change_matrix)` to fan out targeted jobs, or inspect `skipped_reason` to short-circuit.

## 2. Security Keyword Gate Example

```yaml
- uses: casperkristiansson/python-version-patch-pr@v1
  id: guarded
  with:
    track: '3.11'
    security_keywords: |
      CVE
      security fix
```

**Outcome:** The action fetches CPython release notes for the resolved patch. If neither `CVE` nor `security fix` appears, logs show:

```
skipped_reason=security_gate_blocked
Release notes do not contain the configured security keywords (CVE, security fix); skipping.
```

Outputs include `skipped_reason` and empty file lists so downstream jobs can notify security teams without running merges.

## 3. Workflow Permission Warning

When the action lacks the `workflow` scope but finds workflow pins, `generatePullRequestBody` adds a notice:

```md
## ⚠️ Workflow File Notice
The following workflow files were detected but left unchanged because the provided token lacks the `workflow` scope:
- `.github/workflows/python-version-patch.yml`

Provide a personal access token with the `workflow` scope before rerunning to update these files automatically.
```

Additionally, logs emit `skipped_reason=workflow_permission_required` if no other files need changes. Supply a PAT via `GITHUB_TOKEN` to resolve it.

## 4. Dry-Run Matrix Drilldown

```yaml
- id: bump
  uses: casperkristiansson/python-version-patch-pr@v1
  with:
    dry_run: true

- name: Pretty-print changed files
  if: ${{ steps.bump.outputs.skipped_reason == '' }}
  run: |
    echo '${{ steps.bump.outputs.files_changed }}' | jq .
```

Dry runs still compute diffs and list files but skip git writes. Expect log lines such as:

```
Files that would change (3): Dockerfile, runtime.txt, services/api/.python-version
Dry-run enabled; no files were modified.
```

## 5. Consuming Outputs for Targeted Tests

```yaml
jobs:
  bump:
    steps:
      - uses: casperkristiansson/python-version-patch-pr@v1
        id: bump

  smoke-tests:
    needs: bump
    if: ${{ needs.bump.outputs.skipped_reason == '' }}
    strategy:
      matrix: ${{ fromJSON(needs.bump.outputs.change_matrix) }}
    steps:
      - uses: actions/checkout@v4
      - run: pytest -- ${matrix.file}
```

Each matrix entry contains `{file, new_version}`. Use the metadata for custom logging (`echo "Testing ${{ matrix.file }} on ${{ matrix.new_version }}"`).

## 6. Offline Snapshot Run

When `NO_NETWORK_FALLBACK=true`, provide snapshots:

```sh
export CPYTHON_TAGS_SNAPSHOT=$(cat ./snapshots/tags.json)
export RUNNER_MANIFEST_SNAPSHOT=$(cat ./snapshots/manifest.json)
export PYTHON_ORG_HTML_SNAPSHOT=$(cat ./snapshots/python-org.html)
export RELEASE_NOTES_SNAPSHOT=$(cat ./snapshots/release-notes.json)
node dist/index.js
```

Logs show clear errors if any snapshot is missing, ensuring air-gapped reproducibility.
