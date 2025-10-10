import { existsSync, readFileSync } from 'node:fs';
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
  fetchReleaseNotes,
  resolveLatestPatch,
} from './versioning';
import {
  createBranchAndCommit,
  createOrUpdatePullRequest,
  findExistingPullRequest,
  pushBranch,
} from './git';
import { validateTrack } from './config';
import type { StableTag } from './github';

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

function resolveSecurityKeywords(): string[] {
  return core
    .getMultilineInput('security_keywords', { trimWhitespace: true })
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

function loadJsonSnapshot(envName: string): unknown | undefined {
  const raw = process.env[envName];
  if (!raw || raw.trim() === '') {
    return undefined;
  }

  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch (primaryError) {
    if (existsSync(trimmed)) {
      try {
        const fileContent = readFileSync(trimmed, 'utf8');
        return JSON.parse(fileContent);
      } catch (fileError) {
        throw new Error(
          `Failed to parse JSON snapshot from ${envName}. Ensure it contains valid JSON or a path to a JSON file. Original error: ${(fileError as Error).message}`,
        );
      }
    }

    throw new Error(
      `Failed to parse JSON snapshot from ${envName}. Provide valid JSON or a path to a JSON file. Original error: ${(primaryError as Error).message}`,
    );
  }
}

function loadTextSnapshot(envName: string): string | undefined {
  const raw = process.env[envName];
  if (!raw || raw.trim() === '') {
    return undefined;
  }

  const trimmed = raw.trim();
  if (existsSync(trimmed)) {
    return readFileSync(trimmed, 'utf8');
  }

  return raw;
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
    case 'security_gate_blocked': {
      const configuredKeywords = Array.isArray(result.details?.keywords)
        ? (result.details?.keywords as string[]).join(', ')
        : 'none';
      core.info(
        `Release notes do not contain the configured security keywords (${configuredKeywords}); skipping.`,
      );
      break;
    }
    case 'workflow_permission_required': {
      const workflows = Array.isArray(result.details?.files)
        ? (result.details?.files as string[]).join(', ')
        : '.github/workflows';
      core.warning(
        `This run detected workflow changes (${workflows}) but the provided token lacks workflow write permissions. Provide a personal access token with the "workflow" scope and set it as GITHUB_TOKEN to apply these updates.`,
      );
      break;
    }
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
    createBranchAndCommit,
    pushBranch,
    findExistingPullRequest,
    createOrUpdatePullRequest,
    fetchReleaseNotes,
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
    if (result.workflowFilesSkipped && result.workflowFilesSkipped.length > 0) {
      core.warning(
        `Skipped updating workflow files due to missing workflow permissions: ${result.workflowFilesSkipped.join(', ')}`,
      );
    }
  } else {
    logSkip(result);
  }
}

export async function run(): Promise<void> {
  try {
    const trackInput = core.getInput('track').trim();
    const track = trackInput === '' ? DEFAULT_TRACK : trackInput;
    const validatedTrack = validateTrack(track);

    const includePrerelease = getBooleanInput('include_prerelease', false);
    const automerge = getBooleanInput('automerge', false);
    const useExternalPrAction = getBooleanInput('use_external_pr_action', false);
    const dryRun = getBooleanInput('dry_run', false);
    const effectivePaths = resolvePathsInput();
    const securityKeywords = resolveSecurityKeywords();

    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const baseRefEnv = (process.env.GITHUB_BASE_REF ?? '').trim();
    const refNameEnv = (process.env.GITHUB_REF_NAME ?? '').trim();
    const defaultBranch = baseRefEnv || refNameEnv || 'main';
    const repository = parseRepository(process.env.GITHUB_REPOSITORY);
    const githubToken = process.env.GITHUB_TOKEN;
    const noNetworkFallback = (process.env.NO_NETWORK_FALLBACK ?? '').toLowerCase() === 'true';

    let cpythonTagsSnapshot: StableTag[] | undefined;
    let pythonOrgHtmlSnapshot: string | undefined;
    let runnerManifestSnapshot: unknown | undefined;
    let releaseNotesSnapshot: Record<string, string> | undefined;

    try {
      const rawTagsSnapshot = loadJsonSnapshot('CPYTHON_TAGS_SNAPSHOT');
      if (rawTagsSnapshot !== undefined) {
        if (!Array.isArray(rawTagsSnapshot)) {
          throw new Error('CPYTHON_TAGS_SNAPSHOT must be a JSON array.');
        }
        cpythonTagsSnapshot = rawTagsSnapshot as StableTag[];
      }

      pythonOrgHtmlSnapshot = loadTextSnapshot('PYTHON_ORG_HTML_SNAPSHOT');
      runnerManifestSnapshot = loadJsonSnapshot('RUNNER_MANIFEST_SNAPSHOT');

      const rawReleaseNotesSnapshot = loadJsonSnapshot('RELEASE_NOTES_SNAPSHOT');
      if (rawReleaseNotesSnapshot !== undefined) {
        if (typeof rawReleaseNotesSnapshot !== 'object' || rawReleaseNotesSnapshot === null) {
          throw new Error(
            'RELEASE_NOTES_SNAPSHOT must be a JSON object mapping versions or tags to release note strings.',
          );
        }

        const entries = Object.entries(rawReleaseNotesSnapshot as Record<string, unknown>);
        for (const [, value] of entries) {
          if (typeof value !== 'string') {
            throw new Error('RELEASE_NOTES_SNAPSHOT values must be strings.');
          }
        }

        releaseNotesSnapshot = Object.fromEntries(entries) as Record<string, string>;
      }
    } catch (snapshotError) {
      if (snapshotError instanceof Error) {
        core.setFailed(snapshotError.message);
      } else {
        core.setFailed('Failed to load offline snapshots.');
      }
      return;
    }

    core.startGroup('Configuration');
    core.info(`workspace: ${workspace}`);
    core.info(`track: ${validatedTrack}`);
    core.info(`include_prerelease: ${includePrerelease}`);
    core.info(`paths (${effectivePaths.length}): ${effectivePaths.join(', ')}`);
    core.info(
      `security_keywords (${securityKeywords.length}): ${securityKeywords.length > 0 ? securityKeywords.join(', ') : '(none)'}`,
    );
    core.info(`automerge: ${automerge}`);
    core.info(`use_external_pr_action: ${useExternalPrAction}`);
    core.info(`dry_run: ${dryRun}`);
    core.info(`no_network_fallback: ${noNetworkFallback}`);
    core.info(`default_branch: ${defaultBranch}`);
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
        track: validatedTrack,
        includePrerelease,
        paths: effectivePaths,
        dryRun,
        automerge,
        githubToken,
        repository,
        defaultBranch,
        allowPrCreation: !useExternalPrAction,
        noNetworkFallback,
        securityKeywords,
        snapshots: {
          cpythonTags: cpythonTagsSnapshot,
          pythonOrgHtml: pythonOrgHtmlSnapshot,
          runnerManifest: runnerManifestSnapshot,
          releaseNotes: releaseNotesSnapshot,
        },
      },
      dependencies,
    );

    summarizeResult(result);

    const matrixOutput =
      result.status === 'success'
        ? {
            include: result.filesChanged.map((file) => ({
              file,
              new_version: result.newVersion,
            })),
          }
        : { include: [] as Array<Record<string, string>> };

    if (result.status === 'success') {
      core.setOutput('new_version', result.newVersion);
      core.setOutput('files_changed', JSON.stringify(result.filesChanged));
      core.setOutput('change_matrix', JSON.stringify(matrixOutput));
      core.setOutput('skipped_reason', '');
      return;
    }

    core.setOutput('new_version', result.newVersion ?? '');
    core.setOutput('files_changed', JSON.stringify(result.filesChanged ?? []));
    core.setOutput('change_matrix', JSON.stringify(matrixOutput));
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
