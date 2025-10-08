# Context

Purpose: ship a public GitHub Action that opens a PR when a new **CPython patch** for a tracked `X.Y` is released. Target users: OSS and companies that hard-pin Python patch versions in workflows, Dockerfiles, and version files.

Problem: many repos pin `3.X.Y`. Renovate/Dependabot do not reliably sweep all pins or need custom regex managers. `actions/setup-python` resolves latest patch only when using `3.X` or `3.X.x`, not exact pins.

Scope:

- Track `X.Y` and propose the highest stable `X.Y.Z`.
- Scan common files and bump exact patch pins in place.
- Verify runner availability across ubuntu/macos/windows.
- Open an idempotent PR with clear diff and rollback steps.

Non-goals:

- Major/minor upgrades by default.
- Managing third-party toolchain lockfiles beyond version fields.
- Editing unrelated dependencies.

Success criteria:

- First release used by ≥10 public repos.
- ≥90% test coverage, green CI across ubuntu/macos/windows.
- Zero duplicate PRs per track. Clear skip reasons.

Key dependencies:

- GitHub REST API via Octokit.
- `actions/python-versions` manifest for runner availability.
- Optional python.org releases page as fallback.

Security and permissions:

- Only `contents: write` and `pull-requests: write`.
- No telemetry. Network calls limited to GitHub and optional python.org.
- Concurrency guard and idempotent logic.

Config inputs (initial):

- `track` default `3.13`.
- `include_prerelease` default `false`.
- `paths` globs for scan.
- `automerge` default `false`.
- `dry_run` default `false`.

Verification model:

- Each task has a concrete check: unit tests, snapshots, CI jobs, sandbox PRs, or artifact outputs.
- Emit outputs: `new_version`, `files_changed`, `skipped_reason`.

Release plan:

- `v0.x` until stable. Commit `dist/`. Provenance + CodeQL. Move `v1` tag on first stable.

---

# Tools

Use Context7 MCP for up to date documentation.

# Go-to task list for the public “CPython patch PR” GitHub Action

> Implementation target: JavaScript Action (Node 20, TypeScript), bundled with `@vercel/ncc`, integrated PR creation via Octokit. Optional `peter-evans/create-pull-request`.

## 1) Repo and scaffolding

1. [x] **Create repo and baseline files**
       Tools: `git`, GitHub.
       Files: `LICENSE` (MIT), `README.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.gitignore`.
       Verify: Repo visible. GitHub detects license.

2. [x] **Scaffold TypeScript action**
       Tools: `npm`, `tsc`, template `actions/typescript-action`.
       Files: `package.json`, `tsconfig.json`, `action.yml`, `src/index.ts`.
       Verify: `npm run build` succeeds. `node dist/index.js` prints placeholder.

3. [x] **Define action metadata**
       Inputs: `track`, `include_prerelease`, `paths`, `automerge`, `dry_run`.
       Outputs: `new_version`, `files_changed`, `skipped_reason`. `runs: node20`.
       Verify: `actionlint` passes on sample workflow.

4. [ ] **Add dev tooling**
       Install `eslint`, `prettier`, `vitest`, `@types/node`, `@vercel/ncc`, `actionlint`.
       Verify: `npm run lint` and `npm run test` pass.

5. [ ] **CI for build/test**
       Workflow `.github/workflows/ci.yml` runs lint, test, build, ncc.
       Verify: CI green on PR.

## 2) Core version discovery

6. [ ] **CPython stable tag fetcher**
       Libs: `undici`, `semver`.
       Logic: GitHub tags pagination, filter out `a/b/rc/dev`.
       Verify: Unit test with mocked pages returns only stable tags.

7. [ ] **Latest patch resolver for X.Y**
       Input: `3.13` → output highest `3.13.Z`.
       Verify: Unit test picks max.

8. [ ] **python.org releases fallback**
       Scrape minimal list from source releases if GitHub fails.
       Verify: Mock HTML test extracts `3.13.Z`.

9. [ ] **Runner availability check**
       Fetch `actions/python-versions` `versions-manifest.json`.
       Check ubuntu/macos/windows presence for `X.Y.Z`.
       Verify: Tests for present and missing versions. Flag respected.

## 3) Repo scanning and matching

10. [ ] **Glob discovery**
        Lib: `fast-glob`. Ignore `node_modules`, `.git`, `dist`.
        Verify: Unit test ensures correct file set.

11. [ ] **Regex matchers**
        Patterns for workflows, Dockerfiles, `.python-version`, `.tool-versions`, `runtime.txt`, `tox.ini`, `pyproject.toml`, `Pipfile`, `environment.yml`.
        Verify: Positive/negative unit tests per pattern.

12. [ ] **Scanner module**
        Collect matches with file, position, `X.Y.Z`, `X.Y`.
        Verify: Snapshot test over fixture repo.

13. [ ] **Single X.Y alignment**
        Abort with `skipped_reason=multiple_tracks_detected` if mixed tracks (default).
        Verify: Unit test triggers skip.

## 4) Rewrite engine

14. [ ] **Patch computation**
        Replace `X.Y.Z_old` with `X.Y.Z_new` only when same `X.Y`. Preserve Docker suffixes.
        Verify: Unit tests show minimal diff.

15. [ ] **Dry-run**
        No writes. Summarize planned changes.
        Verify: File hashes unchanged. Summary contains diffs.

16. [ ] **Idempotence**
        If already at latest, set `skipped_reason=already_latest`.
        Verify: Second run produces skip.

17. [ ] **Pre-release guard**
        Default off. Enabled by `include_prerelease=true`.
        Verify: Tests confirm behavior.

## 5) PR creation and safety

18. [ ] **Git branch and commit**
        Create `chore/bump-python-<track>`. Commit updated files.
        Verify: Local e2e shows new branch and commit.

19. [ ] **Create PR via Octokit**
        Title, body with changelog links, manifest evidence, diff summary, rollback. Labels.
        Verify: Sandbox repo e2e PR opens with exact content.

20. [ ] **Duplicate PR prevention**
        Search open PRs by head branch. Update branch if present.
        Verify: Second run updates same PR.

21. [ ] **Optional external PR action**
        Flag `use_external_pr_action`. Skip internal PR. Emit outputs for `peter-evans/create-pull-request`.
        Verify: Example workflow successfully creates PR.

22. [ ] **Automerge**
        If `automerge=true`, set label or merge on green via API when permitted.
        Verify: Sandbox e2e merges.

## 6) Docs and UX

23. [ ] **README quick start + advanced config**
        Include minimal and guarded examples, inputs/outputs tables, permissions, FAQs.
        Verify: `actionlint` validates examples.

24. [ ] **CHANGELOG and versioning**
        Keep `CHANGELOG.md`. Plan `v0.x` then `v1`.
        Verify: Release notes generated on tag.

25. [ ] **Action icon and color**
        Update `action.yml` branding.
        Verify: Marketplace shows branding.

26. [ ] **Security model doc**
        Explain permissions, tokens, network endpoints.
        Verify: `SECURITY.md` updated.

## 7) Testing matrix

27. [ ] **Unit tests full coverage**
        Cover fetchers, parsers, matchers, rewriter, PR logic (mocked).
        Verify: Coverage ≥ 90%.

28. [ ] **Fixture repos**
        Cases: only workflows, only Docker, mixed, conflicting tracks, prerelease-only.
        Verify: Snapshot outputs stable.

29. [ ] **Dry-run CI job on fixtures**
        Upload `GITHUB_STEP_SUMMARY` artifacts.
        Verify: Artifacts contain expected diffs.

30. [ ] **E2E sandbox nightly**
        Nightly scheduled PR cycle in a sandbox repo.
        Verify: PR created and closes as expected.

31. [ ] **API throttling**
        Use Octokit throttling plugin. Retry with backoff.
        Verify: Tests assert retries and clear messages.

## 8) Build, bundle, release

32. [ ] **Bundle with ncc and commit `dist/`**
        `ncc build src/index.ts -o dist`.
        Verify: `dist/index.js` runs. No dynamic requires.

33. [ ] **Release workflow**
        Tag `v0.1.0`. Maintain moving `v1`.
        Verify: Tags and Marketplace listing live.

34. [ ] **Provenance + CodeQL**
        Enable `codeql-analysis`. Attach provenance to releases.
        Verify: CodeQL green. Provenance present.

35. [ ] **Example consumer repos**
        Public minimal and guarded samples using the Action.
        Verify: Badges and scheduled runs visible.

## 9) Quality and guardrails

36. [ ] **Failure modes and messages**
        Emit `multiple_tracks_detected`, `runners_missing`, `no_matches_found`, `already_latest`, `pr_exists`, `pr_creation_failed`.
        Verify: Tests assert outputs and logs.

37. [ ] **Config validation with zod**
        Validate `track` as `/^\d+\.\d+$/`.
        Verify: Bad inputs fail fast.

38. [ ] **Concurrency control**
        Check existing ref before branch create. Document workflow `concurrency`.
        Verify: Parallel runs yield one PR.

39. [ ] **Rollback instructions generator**
        PR body includes exact git commands.
        Verify: Snapshot contains commands with placeholders.

40. [ ] **No extra telemetry**
        Only GitHub + python.org calls. Env `NO_NETWORK_FALLBACK=true` supported with injected data.
        Verify: Network-blocked tests pass using fixtures.

## 10) Optional compatibility and polish

41. [ ] **Renovate/Dependabot coexistence docs**
        Provide ignore rules to avoid flapping.
        Verify: Example configs tested.

42. [ ] **Security keyword gating**
        Input `security_keywords` to gate bumps by release notes.
        Verify: Mock notes trigger gate.

43. [ ] **Matrix output for CI**
        Output JSON of changed files and new version.
        Verify: Example consumes output.

44. [ ] **Windows path handling**
        Use `node:path`. Add Windows CI job.
        Verify: Windows runner green.

45. [ ] **Performance baseline**
        Log files scanned and duration.
        Verify: Fixture scan < 3s on CI.
