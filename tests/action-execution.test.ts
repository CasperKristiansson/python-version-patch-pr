import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  executeAction,
  type ExecuteDependencies,
  type ExecuteOptions,
} from '../src/action-execution';
import type { PullRequestResult } from '../src/git';
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
  createBranchAndCommit: vi.fn(async () => ({
    branch: 'chore/bump-python-3.13',
    commitCreated: true,
    filesCommitted: ['Dockerfile', 'runtime.txt'],
  })),
  pushBranch: vi.fn(async () => undefined),
  findExistingPullRequest: vi.fn(),
  createOrUpdatePullRequest: vi.fn(
    async (): Promise<PullRequestResult> => ({
      action: 'created',
      number: 1,
      url: undefined,
    }),
  ),
  fetchReleaseNotes: vi.fn(async () => 'General maintenance release.'),
});

const baseOptions: ExecuteOptions = {
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
  noNetworkFallback: false,
  snapshots: undefined,
  securityKeywords: [],
};

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
    deps.createOrUpdatePullRequest = vi.fn(async (): Promise<PullRequestResult> => {
      throw new Error('boom');
    });

    const workspace = await mkdtemp(path.join(tmpdir(), 'python-version-patch-pr-'));

    try {
      await writeFile(path.join(workspace, 'Dockerfile'), 'FROM python:3.13.0-slim\n');
      await writeFile(path.join(workspace, 'runtime.txt'), 'python-3.13.0\n');

      const result = await executeAction(
        {
          ...baseOptions,
          workspace,
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
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('skips when security keywords are configured but missing from release notes', async () => {
    deps.fetchReleaseNotes = vi.fn(async () => 'Maintenance improvements only.');

    const result = await executeAction(
      {
        ...baseOptions,
        securityKeywords: ['security', 'cve'],
      },
      deps,
    );

    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('security_gate_blocked');
      expect(result.details).toEqual({
        keywords: ['security', 'cve'],
        releaseNotesFound: true,
      });
    }
  });

  it('continues when release notes mention a configured security keyword', async () => {
    deps.fetchReleaseNotes = vi.fn(async () => 'Addresses CVE-2025-1234 and improves stability.');

    const result = await executeAction(
      {
        ...baseOptions,
        securityKeywords: ['cve'],
      },
      deps,
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.newVersion).toBe('3.13.1');
    }
  });

  it('skips when release notes are unavailable and no-network fallback is enabled', async () => {
    deps.fetchReleaseNotes = vi.fn(); // Should not be called when noNetworkFallback is true.

    const result = await executeAction(
      {
        ...baseOptions,
        noNetworkFallback: true,
        securityKeywords: ['security'],
        snapshots: {
          ...baseOptions.snapshots,
          releaseNotes: undefined,
        },
      },
      deps,
    );

    expect(result.status).toBe('skip');
    if (result.status === 'skip') {
      expect(result.reason).toBe('security_gate_blocked');
      expect(result.details).toEqual({
        keywords: ['security'],
        releaseNotesFound: false,
      });
    }
    expect(deps.fetchReleaseNotes).not.toHaveBeenCalled();
  });
});
