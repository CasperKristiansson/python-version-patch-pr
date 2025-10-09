import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StableTag } from '../src/github';
import { fetchStableCpythonTags } from '../src/github';
import { resolveLatestPatch } from '../src/versioning/latest-patch-resolver';

vi.mock('../src/github', async () => {
  const actual = await vi.importActual<typeof import('../src/github')>('../src/github');
  return {
    ...actual,
    fetchStableCpythonTags: vi.fn(),
  };
});

describe('resolveLatestPatch', () => {
  const mockedFetch = vi.mocked(fetchStableCpythonTags);

  const sampleTags: StableTag[] = [
    {
      tagName: 'v3.13.3rc1',
      version: '3.13.3-rc.1',
      major: 3,
      minor: 13,
      patch: 3,
      commitSha: 'sha-3-13-3-rc1',
    },
    {
      tagName: 'v3.13.2',
      version: '3.13.2',
      major: 3,
      minor: 13,
      patch: 2,
      commitSha: 'sha-3-13-2',
    },
    {
      tagName: 'v3.13.1',
      version: '3.13.1',
      major: 3,
      minor: 13,
      patch: 1,
      commitSha: 'sha-3-13-1',
    },
    {
      tagName: 'v3.12.5',
      version: '3.12.5',
      major: 3,
      minor: 12,
      patch: 5,
      commitSha: 'sha-3-12-5',
    },
  ];

  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('selects the highest stable patch for a track', async () => {
    const result = await resolveLatestPatch('3.13', { tags: sampleTags });

    expect(result).toEqual({
      version: '3.13.2',
      tagName: 'v3.13.2',
      commitSha: 'sha-3-13-2',
    });
  });

  it('returns null when no matching tags are found', async () => {
    const result = await resolveLatestPatch('3.11', { tags: sampleTags });

    expect(result).toBeNull();
  });

  it('can include prereleases when requested', async () => {
    const result = await resolveLatestPatch('3.13', {
      includePrerelease: true,
      tags: sampleTags,
    });

    expect(result).toEqual({
      version: '3.13.3-rc.1',
      tagName: 'v3.13.3rc1',
      commitSha: 'sha-3-13-3-rc1',
    });
  });

  it('falls back to fetching when tags are not provided', async () => {
    mockedFetch.mockResolvedValue(sampleTags);

    const result = await resolveLatestPatch('3.13');

    expect(mockedFetch).toHaveBeenCalled();
    expect(result).toEqual({
      version: '3.13.2',
      tagName: 'v3.13.2',
      commitSha: 'sha-3-13-2',
    });
  });

  it('supports bypassing network by providing tags directly', async () => {
    const result = await resolveLatestPatch('3.12', { tags: sampleTags });

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      version: '3.12.5',
      tagName: 'v3.12.5',
      commitSha: 'sha-3-12-5',
    });
  });

  it('throws when network is disabled and tags are missing', async () => {
    await expect(resolveLatestPatch('3.13', { noNetworkFallback: true })).rejects.toThrow(
      /NO_NETWORK_FALLBACK/,
    );
  });

  it('uses provided tags when network is disabled', async () => {
    const result = await resolveLatestPatch('3.13', {
      noNetworkFallback: true,
      tags: sampleTags,
    });

    expect(result).toEqual({
      version: '3.13.2',
      tagName: 'v3.13.2',
      commitSha: 'sha-3-13-2',
    });
  });

  it('rejects invalid track values', async () => {
    await expect(resolveLatestPatch('3')).rejects.toThrow(/Track "3" must be in the form X.Y/);
  });
});
