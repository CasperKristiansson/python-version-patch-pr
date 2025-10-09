# Security Policy

We take the security of CPython Patch PR Action seriously. This document describes how we
mitigate risk, how the action interacts with GitHub infrastructure, and how to report
vulnerabilities responsibly.

## Supported versions

Only the latest released version (the `v0` tag during the pre-1.0 cycle) receives
security updates. Please upgrade to the newest minor release before opening security
reports.

## Required permissions

The action needs the following GitHub token permissions:

- `contents: write` – push branches with updated CPython versions.
- `pull-requests: write` – create or update pull requests.

We recommend restricting the workflow token to the minimal scopes above. If you
run the action in dry-run mode, you can downgrade permissions to `read` until you
are ready to publish PRs.

## Network endpoints

External network access is limited to:

- `api.github.com` – fetch CPython tags and create/update pull requests.
- `raw.githubusercontent.com/actions/python-versions` – retrieve runner manifests.
- `www.python.org` – fallback source to confirm released patch versions.

No telemetry or analytics endpoints are used. If you need to run the action in a
restricted environment, consider mirroring the above endpoints and pointing the
workflow to your mirrors.

## Handling secrets

The action uses the workflow token (`GITHUB_TOKEN`) to push branches and open
pull requests. Do not pass personal access tokens unless you need to target
private forks or cross-organization repositories.

## Incident response

If we confirm a critical vulnerability, we will:

1. Publish a fixed release and update the `v0` tag.
2. Document the risk, affected versions, and mitigation steps in the changelog.
3. Notify followers through the repository Security Advisory system when available.

Thank you for helping keep the CPython ecosystem secure.
