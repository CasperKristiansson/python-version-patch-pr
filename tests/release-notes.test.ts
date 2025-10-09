import { describe, expect, it } from 'vitest';

import { fetchReleaseNotes } from '../src/versioning';

describe('fetchReleaseNotes', () => {
  const createFetch = (response: { status: number; body?: unknown }) =>
    async () => ({
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      async json() {
        return response.body ?? {};
      },
    });

  it('returns release note body when available', async () => {
    const fetchImpl = createFetch({ status: 200, body: { body: 'Security fix included.' } });

    const notes = await fetchReleaseNotes('v3.13.1', { fetchImpl });

    expect(notes).toBe('Security fix included.');
  });

  it('returns null for missing releases', async () => {
    const fetchImpl = createFetch({ status: 404 });

    const notes = await fetchReleaseNotes('v3.13.99', { fetchImpl });

    expect(notes).toBeNull();
  });

  it('throws when the API responds with an unexpected status', async () => {
    const fetchImpl = createFetch({ status: 500 });

    await expect(fetchReleaseNotes('v3.13.1', { fetchImpl })).rejects.toThrow(
      'Failed to fetch release notes for v3.13.1 (status 500).',
    );
  });
});
