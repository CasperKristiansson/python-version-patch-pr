import { describe, expect, it, vi } from 'vitest';
import { Response } from 'undici';

import { fetchStableCpythonTags } from '../src/github/cpython-tags';

const createResponse = (body: unknown, status = 200): Response => {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(serialized, {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
};

describe('fetchStableCpythonTags', () => {
  it('returns only stable tags across paginated responses', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      const page = url.searchParams.get('page');

      switch (page) {
        case '1':
          return createResponse([
            { name: 'v3.13.2', commit: { sha: 'sha-3-13-2' } },
            { name: 'v3.13.2rc1', commit: { sha: 'sha-3-13-2-rc1' } },
          ]);
        case '2':
          return createResponse([
            { name: 'v3.13.1', commit: { sha: 'sha-3-13-1' } },
            { name: 'v3.13.1a1', commit: { sha: 'sha-3-13-1-a1' } },
          ]);
        case '3':
          return createResponse([{ name: 'v3.13.0', commit: { sha: 'sha-3-13-0' } }]);
        default:
          return createResponse([]);
      }
    });

    const tags = await fetchStableCpythonTags({ perPage: 2, fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(tags.map((tag) => tag.version)).toEqual(['3.13.2', '3.13.1', '3.13.0']);
    expect(tags.map((tag) => tag.commitSha)).toEqual(['sha-3-13-2', 'sha-3-13-1', 'sha-3-13-0']);
  });

  it('throws when GitHub responds with a non-OK status', async () => {
    const fetchMock = vi.fn(async () => createResponse({ message: 'oops' }, 500));

    await expect(fetchStableCpythonTags({ fetchImpl: fetchMock })).rejects.toThrow(/status 500/);
  });

  it('throws when GitHub returns an unexpected payload', async () => {
    const fetchMock = vi.fn(async () => createResponse({ tag: 'invalid' }));

    await expect(fetchStableCpythonTags({ fetchImpl: fetchMock })).rejects.toThrow(
      /Unexpected payload/,
    );
  });

  it('stops pagination when page has no stable tags', async () => {
    const fetchMock = vi.fn(async () =>
      createResponse([{ name: 'v3.13.0a1', commit: { sha: 'sha' } }]),
    );

    const tags = await fetchStableCpythonTags({ perPage: 1, fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tags).toEqual([]);
  });
});
