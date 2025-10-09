# Example Consumer Repositories

This directory hosts ready-to-fork templates that demonstrate how to adopt the
CPython Patch PR Action in downstream projects. Each template includes:

- A minimal repository `README.md` with status badges you can reuse.
- A scheduled workflow that exercises the action.
- Optional guardrails tailored to the scenario.

To use one of the samples:

1. Create a new public repository (recommended names listed below).
2. Copy the corresponding template files, preserving the directory structure.
3. Update the status badge URLs in the README to match your repository.
4. Push to `main`. The schedule and any manually dispatched runs will validate the setup.

Available templates:

- `minimal/` – single-job workflow that bumps a single CPython track on a weekly cadence.
- `guarded/` – two-stage workflow that performs a dry-run preview before applying updates and requires a protection keyword in release notes before merging.

Badges use the canonical GitHub Actions syntax:

```md
![Workflow status](https://github.com/<owner>/<repo>/actions/workflows/python-version-patch.yml/badge.svg)
```

Replace `<owner>` and `<repo>` with your namespace and repository name after
creating the consumer repo.
