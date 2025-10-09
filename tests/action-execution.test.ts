import { describe, expect, it, beforeEach, vi } from 'vitest';

import { executeAction, type ExecuteDependencies } from '../src/action-execution';
import type { VersionMatch } from '../src/scanning';
import type { ScanResult } from '../src/scanning/scanner';

const createMatch = (file: string, version: string): VersionMatch => {
  const [major, minor, patch] = version.split('.').map((value) => Number.parseInt(value, 10));
  return {
    file,
    line: 1,
    column: 1,
    matched: version,
    major,
    minor,
    patch,
    index: 0,
  };
};

const baseDependencies = (): ExecuteDependencies => ({
  scanForPythonVersions: vi.fn(
    async (): Promise<ScanResult> => ({
      filesScanned: 2,
      matches: [createMatch('Dockerfile', '3.13.0'), createMatch('runtime.txt', '3.13.0')],
    }),
  ),
  determineSingleTrack: vi.fn(() => ({ track: '3.13', conflicts: [] })),
  resolveLatestPatch: vi.fn(async () => ({
    version: '3.13.1',
    tagName: 'v3.13.1',
    commitSha: 'abc',
  })),
  fetchLatestFromPythonOrg: vi.fn(async () => ({ version: '3.13.1' })),
  enforcePreReleaseGuard: vi.fn(() => ({ allowed: true })),
  fetchRunnerAvailability: vi.fn(async () => ({
    version: '3.13.1',
    availableOn: { linux: true, mac: true, win: true },
  })),
  findExistingPullRequest: vi.fn(),
  createOrUpdatePullRequest: vi.fn(async () => ({
    action: 'created',
    number: 1,
    url: undefined,
  })),
});

const baseOptions = {
  workspace: '.',
  track: '3.13',
  includePrerelease: false,
  paths: ['**/*'],
  dryRun: true,
  automerge: false,
  githubToken: undefined,
  repository: null,
  defaultBranch: 'main',
  allowPrCreation: false,
} as const;

describe('executeAction failure modes', () => {
  let deps: ExecuteDependencies;

  beforeEach(() => {
    deps = baseDependencies();
  });

  it('returns no_matches_found when scanner finds nothing', async () => {
    deps.scanForPythonVersions = vi.fn(async () => ({ filesScanned: 0, matches: [] }));

    const result = await executeAction(baseOptions, deps);

    expect(result).toEqual({
      status: 'skip',
      reason: 'no_matches_found',
      filesChanged: [],
    });
  });

  it('returns multiple_tracks_detected when conflicts exist', async () => {
    deps.determineSingleTrack = vi.fn(() => ({ track: null, conflicts: ['3.12', '3.13'] }));

    const result = await executeAction(baseOptions, deps);

    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('multiple_tracks_detected');
      expect(result.details).toEqual({ conflicts: ['3.12', '3.13'] });
    }
  });

  it('returns runners_missing when any platform is absent', async () => {
    deps.fetchRunnerAvailability = vi.fn(async () => ({
      version: '3.13.1',
      availableOn: { linux: true, mac: false, win: true },
    }));

    const result = await executeAction(baseOptions, deps);

    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('runners_missing');
      expect(result.details).toEqual({ missing: ['mac'] });
    }
  });

  it('returns already_latest when all matches already use latest', async () => {
    deps.scanForPythonVersions = vi.fn(async () => ({
      filesScanned: 2,
      matches: [createMatch('Dockerfile', '3.13.1')],
    }));

    const result = await executeAction(baseOptions, deps);

    expect(result).toEqual({
      status: 'skip',
      reason: 'already_latest',
      newVersion: '3.13.1',
      filesChanged: [],
    });
  });

  it('returns pr_exists when an existing PR is detected', async () => {
    deps.findExistingPullRequest = vi.fn(async () => ({
      number: 42,
      url: 'https://example/pr/42',
    }));
    const result = await executeAction(
      {
        ...baseOptions,
        dryRun: false,
        allowPrCreation: true,
        githubToken: 'token',
        repository: { owner: 'owner', repo: 'repo' },
      },
      deps,
    );

    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('pr_exists');
      expect(result.details).toEqual({ number: 42, url: 'https://example/pr/42' });
    }
  });

  it('returns pr_creation_failed when PR creation throws', async () => {
    deps.findExistingPullRequest = vi.fn(async () => null);
    deps.createOrUpdatePullRequest = vi.fn(async () => {
      throw new Error('boom');
    });

    const result = await executeAction(
      {
        ...baseOptions,
        dryRun: false,
        allowPrCreation: true,
        githubToken: 'token',
        repository: { owner: 'owner', repo: 'repo' },
      },
      deps,
    );

    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('pr_creation_failed');
      expect(result.details).toEqual({ message: 'boom' });
    }
  });
});
