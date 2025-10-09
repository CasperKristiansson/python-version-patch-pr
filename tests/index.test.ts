import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@actions/core', () => coreMocks);
vi.mock('../src/action-execution', () => ({
  executeAction: actionExecutionMocks.executeAction,
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

import { run } from '../src/index';

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'track') return '';
      return '';
    });
    mockGetMultilineInput.mockReturnValue([]);
    mockExecuteAction.mockResolvedValue({
      status: 'success',
      newVersion: '3.13.1',
      filesChanged: ['Dockerfile'],
      dryRun: true,
    });
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
    expect(mockInfo).toHaveBeenCalledWith('automerge: false');
    expect(mockInfo).toHaveBeenCalledWith('dry_run: false');
    expect(mockExecuteAction).toHaveBeenCalled();
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
    mockGetMultilineInput.mockReturnValue(['requirements.txt']);

    await run();

    expect(mockInfo).toHaveBeenCalledWith('track: 3.11');
    expect(mockInfo).toHaveBeenCalledWith('include_prerelease: true');
    expect(mockInfo).toHaveBeenCalledWith('automerge: true');
    expect(mockInfo).toHaveBeenCalledWith('dry_run: true');
    expect(mockInfo).toHaveBeenCalledWith('paths (1): requirements.txt');
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
});
