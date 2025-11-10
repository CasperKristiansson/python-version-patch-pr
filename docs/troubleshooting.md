# Troubleshooting

Use this guide to interpret `skipped_reason`, log output, and common failure messages emitted by `src/index.ts` + `src/action-execution.ts`.

## Skip Reasons

| `skipped_reason`               | Meaning                                                                                                          | Resolution                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `no_matches_found`             | The scanner could not find any `X.Y.Z` pins inside the configured `paths`.                                       | Expand glob coverage, ensure files are checked into the repo, or run the action in directories that actually contain pins.           |
| `multiple_tracks_detected`     | Matches span more than one minor series (e.g., `3.11` and `3.12`).                                               | Split the repo into multiple jobs, each with its own `track` + `paths`. Intentional heterogeneity per file must be handled manually. |
| `pre_release_guarded`          | Latest tag is a pre-release and `include_prerelease` is `false`.                                                 | Set `include_prerelease: true` or wait for the stable patch.                                                                         |
| `security_gate_blocked`        | `security_keywords` were provided but no release note (or no keyword match) was found.                           | Confirm `RELEASE_NOTES_SNAPSHOT` / network access, update keyword list, or temporarily disable the gate.                             |
| `runners_missing`              | The requested patch is absent from at least one hosted runner OS per `runner-availability.ts`.                   | Wait for the `actions/python-versions` manifest to publish the patch or adjust CI to use available runners only.                     |
| `workflow_permission_required` | Workflow YAML files need updating but the provided token lacks the `workflow` scope.                             | Inject a PAT with `workflow` scope via `GITHUB_TOKEN` or exclude workflow files from `paths`.                                        |
| `already_latest`               | All matching files already use the resolved patch.                                                               | Nothing to do. Use this as a signal to skip follow-up jobs.                                                                          |
| `pr_exists`                    | `findExistingPullRequest` found an open PR on `chore/bump-python-<track>`.                                       | Close/merge the existing PR or delete the branch before re-running.                                                                  |
| `pr_creation_failed`           | An exception occurred while committing, pushing, or calling Octokit. Details appear in `result.details.message`. | Inspect the log for git errors (conflicts, auth failures) or Octokit messages (permissions, branch deleted). Re-run after resolving. |

`files_changed` still lists candidate files for some skips (for example `runners_missing`) so downstream jobs can alert owners even when automation halts.

## Common Runtime Errors

- **"Failed to fetch CPython tags" / "python.org releases"** – Network outages or rate limits. Retry later, provide a PAT, or set `NO_NETWORK_FALLBACK=true` with the relevant snapshots.
- **"Track must be in the form X.Y"** – Input validation failed. Update the workflow or `with.track` to match `3.11`, not `3.11.x`.
- **Git push failures** – Usually due to branch protection or mismatched history. Delete `chore/bump-python-<track>` on the remote or allow force pushes for that branch.
- **"Workflow File Notice" section in PR body** – Appears when workflow files were skipped because the token lacked permissions. Provide a PAT and rerun; the notice will disappear automatically once files can be updated.

## Debug Tips

- Enable step-debug logging: set the workflow secret `ACTIONS_STEP_DEBUG=true` to increase `@actions/core` output.
- Capture Vitest traces locally when reproducing logic bugs (`npx vitest run --runInBand`).
- When investigating scanner behavior, run `node dist/index.js` locally with `INPUT_PATHS` narrowed to a single file and inspect logged matches.
- Use `dry_run: true` to verify what would change before burning CI minutes on PR creation.

## Support Channels

- File issues with reproduction steps (include `skipped_reason`, log excerpts, and relevant workflow YAML).
- Check `ROADMAP.md` to see if your scenario is already tracked (e.g., richer external PR support).
