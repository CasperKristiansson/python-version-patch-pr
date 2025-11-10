# Workflow Recipes

Use these examples to wire the action into your automation. Each snippet is self-contained and safe to copy into `.github/workflows/*.yml`.

## 1. Weekly Scheduled Bump

```yaml
name: CPython Patch Bot

on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  bump-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bump CPython patch versions
        uses: casperkristiansson/python-version-patch-pr@v1
        with:
          track: '3.12'
          automerge: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- Schedule Mondays at 09:00 UTC and still allow manual runs.
- Adjust `track` per repository. Run independent jobs per track when needed.

## 2. Dry-Run Preview with Manual Approval

```yaml
jobs:
  preview:
    runs-on: ubuntu-latest
    outputs:
      skipped_reason: ${{ steps.bump.outputs.skipped_reason }}
      files_changed: ${{ steps.bump.outputs.files_changed }}
    steps:
      - uses: actions/checkout@v4
      - id: bump
        uses: casperkristiansson/python-version-patch-pr@v1
        with:
          dry_run: true
```

Pair this with a second job that checks `needs.preview.outputs.skipped_reason == ''` before applying the change manually or via a follow-up workflow.

## 3. Security-Gated Rollout

```yaml
jobs:
  bump-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: casperkristiansson/python-version-patch-pr@v1
        with:
          security_keywords: |
            CVE
            security
          include_prerelease: false
```

The job exits early unless CPython release notes mention one of the keywords. Combine with Slack/Teams notifications to alert security teams when a keyword is found.

## 4. Matrix Fan-Out for Targeted Tests

```yaml
jobs:
  bump:
    runs-on: ubuntu-latest
    outputs:
      change_matrix: ${{ steps.bump.outputs.change_matrix }}
      skipped_reason: ${{ steps.bump.outputs.skipped_reason }}
    steps:
      - uses: actions/checkout@v4
      - id: bump
        uses: casperkristiansson/python-version-patch-pr@v1

  targeted-tests:
    needs: bump
    if: ${{ needs.bump.outputs.skipped_reason == '' }}
    strategy:
      matrix: ${{ fromJSON(needs.bump.outputs.change_matrix) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run focused tests
        run: npm test -- ${{ matrix.file }}
```

`change_matrix` turns each touched file into `{file, new_version}`. Use it to run targeted CI or send file-specific notifications.

## 5. Handling Workflow File Edits

Workflow files require a PAT with the `workflow` scope. Configure a secret (`PATCH_PR_TOKEN`) and map it to `GITHUB_TOKEN`:

```yaml
- uses: casperkristiansson/python-version-patch-pr@v1
  env:
    GITHUB_TOKEN: ${{ secrets.PATCH_PR_TOKEN }}
```

If you do not supply a PAT, the action skips workflow files and sets `skipped_reason=workflow_permission_required` when nothing else needs updates. Watch the logs for a list of skipped files.

## 6. Multi-Track Repositories

Split paths per track to avoid `multiple_tracks_detected`:

```yaml
jobs:
  bump-311:
    steps:
      - uses: actions/checkout@v4
      - uses: casperkristiansson/python-version-patch-pr@v1
        with:
          track: '3.11'
          paths: |
            Dockerfile
            services/runtime-311/**

  bump-312:
    steps:
      - uses: actions/checkout@v4
      - uses: casperkristiansson/python-version-patch-pr@v1
        with:
          track: '3.12'
          paths: |
            .github/workflows/**/*.yml
            services/runtime-312/**
```

Each job scopes discovery to its slice of the repo, ensuring only the intended pins update.

## 7. External Pull Request Mode (Inspection Only)

```yaml
- id: bump
  uses: casperkristiansson/python-version-patch-pr@v1
  with:
    use_external_pr_action: true
```

This currently behaves like `dry_run`: you get `new_version`, `files_changed`, and `change_matrix`, but no files are changed. Use this mode for inventory or dashboards until branch/title/body outputs are added.

## 8. Referencing the Example Repositories

The `examples/` directory ships fully documented templates:

- `examples/minimal` – single job schedule.
- `examples/guarded` – preview job + gated apply job.
- `examples/coexistence` – Renovate/Dependabot coexistence configs validated by tests.

Copy the template that matches your governance model, then follow the README inside each example to wire badges and repository metadata.
