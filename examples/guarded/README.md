# Guarded CPython Patch PR Example

This template demonstrates a more conservative deployment of the CPython Patch
PR Action. It performs a dry-run preview, checks release notes for security
keywords, and only applies updates when the guard passes.

![Workflow status](https://github.com/<owner>/python-version-patch-pr-example-guarded/actions/workflows/python-version-patch.yml/badge.svg)

## Highlights

- Two-job workflow with a dry-run preview and gated apply step.
- Concurrency group to avoid overlapping runs.
- Example of inspecting `skipped_reason` and release note metadata before
  applying changes.
- Ready-made status badge and README snippet for downstream repositories.

## Setup instructions

1. Create a repository named `python-version-patch-pr-example-guarded` (or use
   a similar descriptive name).
2. Copy this directory into the new repository root.
3. Replace `<owner>` in the badge URL with your user or organization handle.
4. Update the `SECURITY_KEYWORDS` environment variable if you want to tailor
   the release note gate.

After pushing to `main`, the scheduled job runs every weekday at 07:15 UTC. You
can also trigger the workflow manually with `workflow_dispatch` for testing.
