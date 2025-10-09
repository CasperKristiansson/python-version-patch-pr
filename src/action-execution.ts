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
import { createOrUpdatePullRequest, findExistingPullRequest, type PullRequestResult } from './git';
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
  | 'security_gate_blocked';

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
}

export type ExecuteResult = SkipResult | SuccessResult;

const DEFAULT_IGNORES = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

function uniqueFiles(matches: VersionMatch[]): string[] {
  return Array.from(new Set(matches.map((match) => match.file))).sort();
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
    allowPrCreation = false,
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

  const matchesNeedingUpdate = scanResult.matches.filter(
    (match) => match.matched !== latestVersion,
  );

  if (matchesNeedingUpdate.length === 0) {
    return {
      status: 'skip',
      reason: 'already_latest',
      newVersion: latestVersion,
      filesChanged: [],
    } satisfies SkipResult;
  }

  const filesChanged = uniqueFiles(matchesNeedingUpdate);

  if (dryRun || !allowPrCreation) {
    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: true,
    } satisfies SuccessResult;
  }

  if (!githubToken || !repository) {
    return {
      status: 'success',
      newVersion: latestVersion,
      filesChanged,
      dryRun: false,
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
    const prBody = generatePullRequestBody({
      track,
      newVersion: latestVersion,
      filesChanged,
      branchName,
      defaultBranch,
    });

    const pullRequest = await dependencies.createOrUpdatePullRequest({
      owner: repository.owner,
      repo: repository.repo,
      head: branchName,
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
