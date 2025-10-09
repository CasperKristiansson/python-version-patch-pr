import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn(),
  getMultilineInput: vi.fn(),
  info: vi.fn(),
  startGroup: vi.fn(),
  endGroup: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  warning: vi.fn(),
}));

const actionExecutionMocks = vi.hoisted(() => ({
  executeAction: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  validateTrack: vi.fn((value: string) => value),
}));

vi.mock('@actions/core', () => coreMocks);
vi.mock('../src/action-execution', () => ({
  executeAction: actionExecutionMocks.executeAction,
}));
vi.mock('../src/config', () => ({
  validateTrack: configMocks.validateTrack,
}));

const mockGetInput = coreMocks.getInput;
const mockGetMultilineInput = coreMocks.getMultilineInput;
const mockInfo = coreMocks.info;
const mockStartGroup = coreMocks.startGroup;
const mockEndGroup = coreMocks.endGroup;
const mockSetOutput = coreMocks.setOutput;
const mockSetFailed = coreMocks.setFailed;
const mockWarning = coreMocks.warning;
const mockExecuteAction = actionExecutionMocks.executeAction as ReturnType<typeof vi.fn>;
const mockValidateTrack = configMocks.validateTrack as ReturnType<typeof vi.fn>;

import { run } from '../src/index';

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'track') return '';
      return '';
    });
    mockGetMultilineInput.mockImplementation((name: string) => {
      if (name === 'paths') {
        return [];
      }
      if (name === 'security_keywords') {
        return [];
      }
      return [];
    });
    mockExecuteAction.mockResolvedValue({
      status: 'success',
      newVersion: '3.13.1',
      filesChanged: ['Dockerfile'],
      dryRun: true,
    });
    mockValidateTrack.mockImplementation((value: string) => value);
  });

  afterEach(() => {
    delete process.env.NO_NETWORK_FALLBACK;
    delete process.env.CPYTHON_TAGS_SNAPSHOT;
    delete process.env.PYTHON_ORG_HTML_SNAPSHOT;
    delete process.env.RUNNER_MANIFEST_SNAPSHOT;
    delete process.env.RELEASE_NOTES_SNAPSHOT;
  });

  it('uses default configuration when inputs are empty', async () => {
    await run();

    expect(mockStartGroup).toHaveBeenCalledWith('Configuration');
    expect(mockEndGroup).toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith('track: 3.13');
    expect(mockInfo).toHaveBeenCalledWith('include_prerelease: false');
    expect(mockInfo).toHaveBeenCalledWith(
      'paths (6): .github/workflows/**/*.yml, Dockerfile, **/Dockerfile, **/*.python-version, **/runtime.txt, **/pyproject.toml',
    );
    expect(mockInfo).toHaveBeenCalledWith('security_keywords (0): (none)');
    expect(mockInfo).toHaveBeenCalledWith('automerge: false');
    expect(mockInfo).toHaveBeenCalledWith('dry_run: false');
    expect(mockInfo).toHaveBeenCalledWith('no_network_fallback: false');
    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({
        securityKeywords: [],
      }),
      expect.any(Object),
    );
    expect(mockSetOutput).toHaveBeenNthCalledWith(1, 'new_version', '3.13.1');
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      2,
      'files_changed',
      JSON.stringify(['Dockerfile']),
    );
    expect(mockSetOutput).toHaveBeenNthCalledWith(3, 'skipped_reason', '');
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('honors provided inputs and paths', async () => {
    mockGetInput.mockImplementation((name: string) => {
      const values: Record<string, string> = {
        track: '3.11',
        include_prerelease: 'true',
        automerge: 'true',
        dry_run: 'true',
      };
      return values[name] ?? '';
    });
    mockGetMultilineInput.mockImplementation((name: string) =>
      name === 'paths' ? ['requirements.txt'] : [],
    );

    await run();

    expect(mockInfo).toHaveBeenCalledWith('track: 3.11');
    expect(mockInfo).toHaveBeenCalledWith('include_prerelease: true');
    expect(mockInfo).toHaveBeenCalledWith('automerge: true');
    expect(mockInfo).toHaveBeenCalledWith('dry_run: true');
    expect(mockInfo).toHaveBeenCalledWith('paths (1): requirements.txt');
    expect(mockInfo).toHaveBeenCalledWith('security_keywords (0): (none)');
    expect(mockEndGroup).toHaveBeenCalled();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('warns and falls back when boolean input is unexpected', async () => {
    mockGetInput.mockImplementation((name: string) => {
      const values: Record<string, string> = {
        include_prerelease: 'not-a-bool',
        automerge: '',
        dry_run: '',
        track: '',
      };
      return values[name] ?? '';
    });

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      'Input "include_prerelease" received unexpected value "not-a-bool". Falling back to false.',
    );
  });

  it('propagates skipped reasons to outputs', async () => {
    mockExecuteAction.mockResolvedValueOnce({
      status: 'skip',
      reason: 'no_matches_found',
      filesChanged: [],
      newVersion: '',
    });

    await run();

    expect(mockSetOutput).toHaveBeenNthCalledWith(1, 'new_version', '');
    expect(mockSetOutput).toHaveBeenNthCalledWith(2, 'files_changed', '[]');
    expect(mockSetOutput).toHaveBeenNthCalledWith(3, 'skipped_reason', 'no_matches_found');
  });

  it('reports failures when unexpected errors occur', async () => {
    mockExecuteAction.mockRejectedValueOnce(new Error('run failure'));

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith('run failure');
  });

  it('fails fast when track input is invalid', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'track') return 'invalid';
      return '';
    });
    mockValidateTrack.mockImplementation(() => {
      throw new Error('Input "track" must match X.Y (e.g. 3.13). Received "invalid".');
    });

    await run();

    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockSetFailed).toHaveBeenCalledWith(
      'Input "track" must match X.Y (e.g. 3.13). Received "invalid".',
    );
  });

  it('supports offline snapshots when NO_NETWORK_FALLBACK is enabled', async () => {
    process.env.NO_NETWORK_FALLBACK = 'true';
    process.env.CPYTHON_TAGS_SNAPSHOT = JSON.stringify([
      {
        tagName: 'v3.13.2',
        version: '3.13.2',
        major: 3,
        minor: 13,
        patch: 2,
        commitSha: 'sha',
      },
    ]);
    process.env.PYTHON_ORG_HTML_SNAPSHOT = '<html></html>';
    process.env.RUNNER_MANIFEST_SNAPSHOT = JSON.stringify([
      { version: '3.13.2', files: [{ platform: 'linux' }] },
    ]);

    await run();

    expect(mockInfo).toHaveBeenCalledWith('no_network_fallback: true');
    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({
        noNetworkFallback: true,
        securityKeywords: [],
        snapshots: expect.objectContaining({
          cpythonTags: expect.any(Array),
          pythonOrgHtml: '<html></html>',
          runnerManifest: expect.any(Array),
          releaseNotes: undefined,
        }),
      }),
      expect.anything(),
    );
  });
});
