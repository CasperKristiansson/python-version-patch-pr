# Minimal CPython Patch PR Example

This template shows the smallest practical setup for the CPython Patch PR
Action. It monitors a single CPython minor stream and opens a pull request
whenever a new patch becomes available.

![Workflow status](https://github.com/<owner>/python-version-patch-pr-example-minimal/actions/workflows/python-version-patch.yml/badge.svg)

## Repository structure

```
.
├── .github
│   └── workflows
│       └── python-version-patch.yml
└── README.md (this file)
```

## Recommended setup steps

1. Create a repository named `python-version-patch-pr-example-minimal` (or
   similar).
2. Copy this directory into the new repository root.
3. Replace `<owner>` in the badge URL above with your GitHub username or
   organization.
4. Optionally adjust the cron schedule or tracked CPython version in the
   workflow.

The included workflow runs weekly and can also be triggered manually via
`workflow_dispatch`. The action writes updated pins, commits them to the
`chore/bump-python-<track>` branch, and opens or updates a corresponding pull
request.
