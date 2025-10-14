# python-version-patch-pr Roadmap

This roadmap is organized by focus areas rather than specific version numbers. Each item links to a GitHub issue where community members can discuss implementation or offer help.

## Status Snapshot
- v1.6.0 shipped on 2025-10-10 with the Marketplace listing now live.
- Current promises include cross-file detection, pre-release guard, runner checks, change matrix outputs, and Renovate/Dependabot coexistence samples.
- Known bug: AWS Lambda Python image tags with non-semver suffixes are rewritten incorrectly ([#8](../../issues/8)).

## Hardening Focus (next patch release)
- [ ] Fix Docker tag parser for non-semver images (see [#8](../../issues/8)).
- [ ] Align default version file globs with documented coverage ([#9](../../issues/9)).
- [ ] Skip PEP 440 range specifications during rewrites ([#10](../../issues/10)).
- [ ] Add optional runner availability gate using `actions/python-versions` manifest ([#11](../../issues/11)).
- [ ] Publish richer GitHub Step Summary with change matrix and runner info ([#12](../../issues/12)).

## Capability Expansions (upcoming minor release)
- [ ] Add opt-in Docker registry existence checks before rewriting tags ([#13](../../issues/13)).
- [ ] Update pre-commit and devcontainer pins when present ([#14](../../issues/14)).
- [ ] Monorepo quality-of-life switches for PR grouping ([#15](../../issues/15)).
- [ ] Allow exclude paths to suppress rewrites in vendor or forked code ([#16](../../issues/16)).

## Policy & Governance Enhancements
- [ ] Support multi-track upgrades per path ([#17](../../issues/17)).
- [ ] Revise security-only upgrade mode with curated keyword set ([#18](../../issues/18)).
- [ ] Revise PR titles/bodies with runner cache guidance ([#19](../../issues/19)).

## Quality, Tests, & Docs
- [ ] Add end-to-end fixtures covering major package and registry scenarios ([#20](../../issues/20)).
- [ ] Introduce fuzz and snapshot tests for tag parsing ([#21](../../issues/21)).
- [ ] Expand adoption docs for Renovate and Dependabot coexistence ([#22](../../issues/22)).
- [ ] Publish troubleshooting guide for common CI failures ([#23](../../issues/23)).

## Longer-term Ideas (breaking changes)
- [ ] Explore GitHub App delivery mode for cross-repo rollouts ([#24](../../issues/24)).
- [ ] Design pluggable resolvers for custom version sources ([#25](../../issues/25)).
- [ ] Prototype policy engine for organization-wide rules ([#26](../../issues/26)).

## Quick Wins to Ship First
1. Fix the Docker tag parser bug ([#8](../../issues/8)).
2. Expand the default glob list to match documentation ([#9](../../issues/9)).
3. Skip range specifications instead of pinning them ([#10](../../issues/10)).
4. Land the runner availability gate and GitHub Step Summary improvements ([#11](../../issues/11), [#12](../../issues/12)).

## Compatibility Notes
- The default `track` remains `3.13`. Weekly patch runs are still appropriate because 3.13 is a stable series.
- Pre-release guard stays off unless users explicitly override it.
