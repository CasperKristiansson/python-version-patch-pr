import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import {
  determineSingleTrack,
  type TrackAlignmentResult,
  type VersionMatch,
  scanForPythonVersions,
} from './scanning';
import {
  enforcePreReleaseGuard,
  fetchLatestFromPythonOrg,
  fetchRunnerAvailability,
  fetchReleaseNotes,
  resolveLatestPatch,
  type LatestPatchResult,
} from './versioning';
import {
  createBranchAndCommit,
  createOrUpdatePullRequest,
  findExistingPullRequest,
  pushBranch,
  type PullRequestResult,
} from './git';
import { generatePullRequestBody } from './pr-body';
import type { StableTag } from './github';

export type SkipReason =
  | 'no_matches_found'
  | 'multiple_tracks_detected'
  | 'runners_missing'
  | 'already_latest'
  | 'pr_exists'
  | 'pr_creation_failed'
  | 'pre_release_guarded'
  | 'security_gate_blocked'
  | 'workflow_permission_required';

export interface ExecuteOptions {
  workspace: string;
  track: string;
  includePrerelease: boolean;
  paths: string[];
  dryRun: boolean;
  automerge: boolean;
  githubToken?: string;
  repository?: { owner: string; repo: string } | null;
  defaultBranch?: string;
  allowPrCreation?: boolean;
  noNetworkFallback?: boolean;
  securityKeywords?: string[];
  snapshots?: {
    cpythonTags?: StableTag[];
    pythonOrgHtml?: string;
    runnerManifest?: unknown;
    releaseNotes?: Record<string, string>;
  };
}

export interface ExecuteDependencies {
  scanForPythonVersions: typeof scanForPythonVersions;
  determineSingleTrack: typeof determineSingleTrack;
  resolveLatestPatch: typeof resolveLatestPatch;
  fetchLatestFromPythonOrg: typeof fetchLatestFromPythonOrg;
  enforcePreReleaseGuard: typeof enforcePreReleaseGuard;
  fetchRunnerAvailability: typeof fetchRunnerAvailability;
  createBranchAndCommit?: typeof createBranchAndCommit;
  pushBranch?: typeof pushBranch;
  findExistingPullRequest?: typeof findExistingPullRequest;
  createOrUpdatePullRequest?: typeof createOrUpdatePullRequest;
  fetchReleaseNotes?: typeof fetchReleaseNotes;
}

export interface SkipResult {
  status: 'skip';
  reason: SkipReason;
  newVersion?: string | null;
  filesChanged?: string[];
  details?: Record<string, unknown>;
}

export interface SuccessResult {
  status: 'success';
  newVersion: string;
  filesChanged: string[];
  dryRun: boolean;
  pullRequest?: PullRequestResult;
  workflowFilesSkipped?: string[];
}

export type ExecuteResult = SkipResult | SuccessResult;

const DEFAULT_IGNORES = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

function uniqueFiles(matches: VersionMatch[]): string[] {
  return Array.from(new Set(matches.map((match) => match.file))).sort();
}

function groupMatchesByFile(matches: VersionMatch[]): Map<string, VersionMatch[]> {
  const grouped = new Map<string, VersionMatch[]>();

  for (const match of matches) {
    const existing = grouped.get(match.file);
    if (existing) {
      existing.push(match);
    } else {
      grouped.set(match.file, [match]);
    }
  }

  return grouped;
}

function isPersonalAccessToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const lowered = token.toLowerCase();
  return (
    lowered.startsWith('ghp_') ||
    lowered.startsWith('github_pat_') ||
    lowered.startsWith('gho_') ||
    lowered.startsWith('pat_')
  );
}

async function applyVersionUpdates(
  workspace: string,
  groupedMatches: Map<string, VersionMatch[]>,
  newVersion: string,
): Promise<void> {
  for (const [relativePath, fileMatches] of groupedMatches) {
    const absolutePath = path.join(workspace, relativePath);
    const originalContent = await readFile(absolutePath, 'utf8');

    const sortedMatches = [...fileMatches].sort((a, b) => b.index - a.index);

    let updatedContent = originalContent;
    let changed = false;

    for (const match of sortedMatches) {
      if (match.matched === newVersion) {
        continue;
      }

      const start = match.index;
      const end = start + match.matched.length;
      updatedContent = updatedContent.slice(0, start) + newVersion + updatedContent.slice(end);
      changed = true;
    }

    if (changed && updatedContent !== originalContent) {
      await writeFile(absolutePath, updatedContent, 'utf8');
    }
  }
}

function resolveGitIdentity(): { name: string; email: string } {
  const actor = (process.env.GITHUB_ACTOR ?? '').trim();
  const envAuthorName = (process.env.GIT_AUTHOR_NAME ?? '').trim();
  const envAuthorEmail = (process.env.GIT_AUTHOR_EMAIL ?? '').trim();

  const name = envAuthorName || actor || 'github-actions[bot]';

  if (envAuthorEmail) {
    return { name, email: envAuthorEmail };
  }

  if (actor) {
    return { name, email: `${actor}@users.noreply.github.com` };
  }

  return { name, email: '41898282+github-actions[bot]@users.noreply.github.com' };
}

function determineMissingRunners(
  availability: Awaited<ReturnType<typeof fetchRunnerAvailability>>,
): string[] {
  if (!availability) {
    return ['linux', 'mac', 'win'];
  }

  return (Object.entries(availability.availableOn) as Array<[string, boolean]>)
    .filter(([, isAvailable]) => !isAvailable)
    .map(([name]) => name)
    .sort();
}

function selectLatestVersion(
  track: string,
  latestPatch: LatestPatchResult | null,
  fallback: Awaited<ReturnType<typeof fetchLatestFromPythonOrg>>,
): string {
  if (latestPatch) {
    return latestPatch.version;
  }

  if (fallback) {
    return fallback.version;
  }

  throw new Error(`Unable to resolve latest patch version for track "${track}".`);
}

export async function executeAction(
  options: ExecuteOptions,
  dependencies: ExecuteDependencies,
): Promise<ExecuteResult> {
  const {
    workspace,
    track,
    includePrerelease,
    paths,
    dryRun,
    githubToken,
    repository,
    defaultBranch = 'main',
    allowPrCreation = true,
    noNetworkFallback = false,
    securityKeywords = [],
    snapshots,
  } = options;

  const scanResult = await dependencies.scanForPythonVersions({
    root: workspace,
    patterns: paths,
    ignore: DEFAULT_IGNORES,
    followSymbolicLinks: false,
  });

  if (scanResult.matches.length === 0) {
    return {
      status: 'skip',
      reason: 'no_matches_found',
      filesChanged: [],
    } satisfies SkipResult;
  }

  const alignment: TrackAlignmentResult = dependencies.determineSingleTrack(scanResult.matches);
  if (alignment.conflicts.length > 0) {
    return {
      status: 'skip',
      reason: 'multiple_tracks_detected',
      details: { conflicts: alignment.conflicts },
    } satisfies SkipResult;
  }

  const latestPatch = await dependencies.resolveLatestPatch(track, {
    includePrerelease,
    token: githubToken,
    tags: snapshots?.cpythonTags,
    noNetworkFallback,
  });
  const fallback = await dependencies.fetchLatestFromPythonOrg({
    track,
    htmlSnapshot: snapshots?.pythonOrgHtml,
    noNetworkFallback,
  });
  const latestVersion = selectLatestVersion(track, latestPatch, fallback);

  const guard = dependencies.enforcePreReleaseGuard(includePrerelease, latestVersion);
  if (!guard.allowed) {
    return {
      status: 'skip',
      reason: guard.reason ?? 'pre_release_guarded',
      newVersion: latestVersion,
    } satisfies SkipResult;
  }

  const normalizedSecurityKeywords = securityKeywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);

  if (normalizedSecurityKeywords.length > 0) {
    const releaseNotesLookup = snapshots?.releaseNotes;
    const releaseNotesFromSnapshot =
      releaseNotesLookup &&
      [latestPatch?.tagName, `v${latestVersion}`, latestVersion].reduce<string | undefined>(
        (acc, key) => {
          if (acc) {
            return acc;
          }
          if (!key) {
            return undefined;
          }
          const direct = releaseNotesLookup[key];
          if (typeof direct === 'string') {
            return direct;
          }
          return undefined;
        },
        undefined,
      );

    let releaseNotesText = releaseNotesFromSnapshot;
    let releaseNotesFound = releaseNotesText != null;

    if (!releaseNotesText && !noNetworkFallback && dependencies.fetchReleaseNotes) {
      const tagForNotes = latestPatch?.tagName ?? `v${latestVersion}`;
      releaseNotesText =
        (await dependencies.fetchReleaseNotes(tagForNotes, {
          token: githubToken,
        })) ?? undefined;
      releaseNotesFound = releaseNotesText != null;
    }

    if (releaseNotesText == null) {
      return {
        status: 'skip',
        reason: 'security_gate_blocked',
        newVersion: latestVersion,
        details: {
          keywords: normalizedSecurityKeywords,
          releaseNotesFound,
        },
      } satisfies SkipResult;
    }

    const lowerCaseNotes = releaseNotesText.toLowerCase();
    const matchedKeyword = normalizedSecurityKeywords.find((keyword) =>
      lowerCaseNotes.includes(keyword.toLowerCase()),
    );

    if (!matchedKeyword) {
      return {
        status: 'skip',
        reason: 'security_gate_blocked',
        newVersion: latestVersion,
        details: {
          keywords: normalizedSecurityKeywords,
          releaseNotesFound: true,
        },
      } satisfies SkipResult;
    }
  }

  const availability = await dependencies.fetchRunnerAvailability(latestVersion, {
    manifestSnapshot: snapshots?.runnerManifest,
    noNetworkFallback,
  });
  const missingRunners = determineMissingRunners(availability);
  if (missingRunners.length > 0) {
    return {
      status: 'skip',
      reason: 'runners_missing',
      newVersion: latestVersion,
      details: { missing: missingRunners },
      filesChanged: uniqueFiles(scanResult.matches),
    } satisfies SkipResult;
  }

  let matchesNeedingUpdate = scanResult.matches.filter((match) => match.matched !== latestVersion);

  if (matchesNeedingUpdate.length === 0) {
    return {
      status: 'skip',
      reason: 'already_latest',
      newVersion: latestVersion,
      filesChanged: [],
    } satisfies SkipResult;
  }

  const hasPersonalAccessToken = isPersonalAccessToken(githubToken);
  const workflowMatches = matchesNeedingUpdate.filter((match) =>
    match.file.startsWith('.github/workflows/'),
  );

  let skippedWorkflowFiles: string[] = [];

  if (!hasPersonalAccessToken && workflowMatches.length > 0) {
    skippedWorkflowFiles = uniqueFiles(workflowMatches);
    matchesNeedingUpdate = matchesNeedingUpdate.filter(
      (match) => !match.file.startsWith('.github/workflows/'),
    );

    if (matchesNeedingUpdate.length === 0) {
      return {
        status: 'skip',
        reason: 'workflow_permission_required',
        newVersion: latestVersion,
        filesChanged: [],
        details: { files: skippedWorkflowFiles },
      } satisfies SkipResult;
    }
  }

  const filesChanged = uniqueFiles(matchesNeedingUpdate);
  const groupedMatches = groupMatchesByFile(matchesNeedingUpdate);

  if (dryRun || !allowPrCreation) {
    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: true,
      workflowFilesSkipped: skippedWorkflowFiles.length > 0 ? skippedWorkflowFiles : undefined,
    } satisfies SuccessResult;
  }

  if (!dependencies.createBranchAndCommit || !dependencies.pushBranch) {
    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: false,
      workflowFilesSkipped: skippedWorkflowFiles.length > 0 ? skippedWorkflowFiles : undefined,
    } satisfies SuccessResult;
  }

  if (!githubToken || !repository) {
    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: false,
      workflowFilesSkipped: skippedWorkflowFiles.length > 0 ? skippedWorkflowFiles : undefined,
    } satisfies SuccessResult;
  }

  const branchName = `chore/bump-python-${track}`;

  if (dependencies.findExistingPullRequest) {
    const existing = await dependencies.findExistingPullRequest({
      owner: repository.owner,
      repo: repository.repo,
      head: branchName,
      authToken: githubToken,
    });

    if (existing) {
      return {
        status: 'skip',
        reason: 'pr_exists',
        newVersion: latestVersion,
        filesChanged,
        details: existing,
      } satisfies SkipResult;
    }
  }

  if (!dependencies.createOrUpdatePullRequest) {
    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: false,
    } satisfies SuccessResult;
  }

  try {
    await applyVersionUpdates(workspace, groupedMatches, latestVersion);

    const { name: authorName, email: authorEmail } = resolveGitIdentity();

    const commitResult = await dependencies.createBranchAndCommit({
      repoPath: workspace,
      track,
      files: filesChanged,
      commitMessage: `chore: bump python ${track} to ${latestVersion}`,
      authorName,
      authorEmail,
    });

    if (!commitResult.commitCreated) {
      return {
        status: 'success',
        newVersion: latestVersion,
        filesChanged,
        dryRun: false,
        workflowFilesSkipped: skippedWorkflowFiles.length > 0 ? skippedWorkflowFiles : undefined,
      } satisfies SuccessResult;
    }

    await dependencies.pushBranch({
      repoPath: workspace,
      branch: commitResult.branch,
    });

    const prBody = generatePullRequestBody({
      track,
      newVersion: latestVersion,
      filesChanged,
      branchName: commitResult.branch,
      defaultBranch,
      skippedWorkflowFiles,
    });

    const pullRequest = await dependencies.createOrUpdatePullRequest({
      owner: repository.owner,
      repo: repository.repo,
      head: commitResult.branch,
      base: defaultBranch,
      title: `chore: bump python ${track} to ${latestVersion}`,
      body: prBody,
      authToken: githubToken,
    });

    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: false,
      pullRequest,
      workflowFilesSkipped: skippedWorkflowFiles.length > 0 ? skippedWorkflowFiles : undefined,
    } satisfies SuccessResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'skip',
      reason: 'pr_creation_failed',
      newVersion: latestVersion,
      filesChanged,
      details: { message },
    } satisfies SkipResult;
  }
}
