import process from 'node:process';

import * as core from '@actions/core';

import {
  executeAction,
  type ExecuteDependencies,
  type ExecuteResult,
  type SkipResult,
} from './action-execution';
import { determineSingleTrack, scanForPythonVersions } from './scanning';
import {
  enforcePreReleaseGuard,
  fetchLatestFromPythonOrg,
  fetchRunnerAvailability,
  resolveLatestPatch,
} from './versioning';
import { createOrUpdatePullRequest, findExistingPullRequest } from './git';

const DEFAULT_TRACK = '3.13';
const DEFAULT_PATHS = [
  '.github/workflows/**/*.yml',
  'Dockerfile',
  '**/Dockerfile',
  '**/*.python-version',
  '**/runtime.txt',
  '**/pyproject.toml',
];

function getBooleanInput(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name).trim().toLowerCase();
  if (raw === '') {
    return fallback;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  core.warning(`Input "${name}" received unexpected value "${raw}". Falling back to ${fallback}.`);
  return fallback;
}

function resolvePathsInput(): string[] {
  const explicitPaths = core.getMultilineInput('paths', { trimWhitespace: true }).filter(Boolean);
  return explicitPaths.length > 0 ? explicitPaths : DEFAULT_PATHS;
}

function parseRepository(slug: string | undefined): { owner: string; repo: string } | null {
  if (!slug) {
    return null;
  }

  const parts = slug.split('/');
  if (parts.length !== 2) {
    core.warning(`Unable to parse GITHUB_REPOSITORY value "${slug}".`);
    return null;
  }

  const [owner, repo] = parts;
  if (!owner || !repo) {
    core.warning(`GITHUB_REPOSITORY is missing owner or repo: "${slug}".`);
    return null;
  }

  return { owner, repo };
}

function logSkip(result: SkipResult): void {
  switch (result.reason) {
    case 'no_matches_found':
      core.info('No pinned Python versions detected within the configured paths. Nothing to do.');
      break;
    case 'multiple_tracks_detected':
      core.warning(
        `Detected multiple CPython tracks (${(result.details?.conflicts as string[] | undefined)?.join(', ') ?? 'unknown'}). Aborting to avoid mixed upgrades.`,
      );
      break;
    case 'runners_missing':
      core.warning(
        `Runner availability check failed for version ${result.newVersion ?? 'unknown'}. Missing: ${
          (result.details?.missing as string[] | undefined)?.join(', ') ?? 'unknown'
        }`,
      );
      break;
    case 'already_latest':
      core.info(`All tracked files already use ${result.newVersion ?? 'the latest version'}.`);
      break;
    case 'pr_exists':
      core.info('An open pull request already exists for this track; skipping duplicate.');
      if (result.details?.url) {
        core.info(`Existing PR: ${String(result.details.url)}`);
      }
      break;
    case 'pr_creation_failed':
      core.warning(
        `Attempted to create or update the pull request but received an error: ${
          result.details?.message ?? 'unknown error'
        }`,
      );
      break;
    case 'pre_release_guarded':
      core.info('Latest tag is a pre-release and include_prerelease is false; skipping.');
      break;
    default:
      core.info(`Skipping with reason ${result.reason}.`);
      break;
  }
}

function buildDependencies(): ExecuteDependencies {
  return {
    scanForPythonVersions,
    determineSingleTrack,
    resolveLatestPatch,
    fetchLatestFromPythonOrg,
    enforcePreReleaseGuard,
    fetchRunnerAvailability,
    findExistingPullRequest,
    createOrUpdatePullRequest,
  };
}

function summarizeResult(result: ExecuteResult): void {
  if (result.status === 'success') {
    core.info(`Resolved latest patch version: ${result.newVersion}`);
    if (result.filesChanged.length === 0) {
      core.info('No files require updates.');
    } else {
      core.info(
        `Files that would change (${result.filesChanged.length}): ${result.filesChanged.join(', ')}`,
      );
    }

    if (result.dryRun) {
      core.info('Dry-run enabled; no files were modified.');
    }

    if (result.pullRequest) {
      const { action, number, url } = result.pullRequest;
      core.info(`Pull request ${action}: #${number}${url ? ` (${url})` : ''}`);
    }
  } else {
    logSkip(result);
  }
}

export async function run(): Promise<void> {
  try {
    const trackInput = core.getInput('track').trim();
    const track = trackInput === '' ? DEFAULT_TRACK : trackInput;

    const includePrerelease = getBooleanInput('include_prerelease', false);
    const automerge = getBooleanInput('automerge', false);
    const dryRun = getBooleanInput('dry_run', false);
    const effectivePaths = resolvePathsInput();

    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const repository = parseRepository(process.env.GITHUB_REPOSITORY);
    const githubToken = process.env.GITHUB_TOKEN;
    const defaultBranch = process.env.GITHUB_BASE_REF ?? process.env.GITHUB_REF_NAME ?? 'main';

    core.startGroup('Configuration');
    core.info(`workspace: ${workspace}`);
    core.info(`track: ${track}`);
    core.info(`include_prerelease: ${includePrerelease}`);
    core.info(`paths (${effectivePaths.length}): ${effectivePaths.join(', ')}`);
    core.info(`automerge: ${automerge}`);
    core.info(`dry_run: ${dryRun}`);
    if (repository) {
      core.info(`repository: ${repository.owner}/${repository.repo}`);
    }
    if (githubToken) {
      core.info('GITHUB_TOKEN: provided');
    } else {
      core.info('GITHUB_TOKEN: not provided');
    }
    core.endGroup();

    const dependencies = buildDependencies();
    const result = await executeAction(
      {
        workspace,
        track,
        includePrerelease,
        paths: effectivePaths,
        dryRun,
        automerge,
        githubToken,
        repository,
        defaultBranch,
        allowPrCreation: false,
      },
      dependencies,
    );

    summarizeResult(result);

    if (result.status === 'success') {
      core.setOutput('new_version', result.newVersion);
      core.setOutput('files_changed', JSON.stringify(result.filesChanged));
      core.setOutput('skipped_reason', '');
      return;
    }

    core.setOutput('new_version', result.newVersion ?? '');
    core.setOutput('files_changed', JSON.stringify(result.filesChanged ?? []));
    core.setOutput('skipped_reason', result.reason);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error');
    }
  }
}

if (require.main === module) {
  void run();
}
