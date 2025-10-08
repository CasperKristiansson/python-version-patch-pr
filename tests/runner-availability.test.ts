import { describe, expect, it } from 'vitest';
import { Response } from 'undici';

import { fetchRunnerAvailability } from '../src/versioning/runner-availability';

const createResponse = (body: unknown, status = 200): Response => {
  const serialized = JSON.stringify(body);
  return new Response(serialized, {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
};

describe('fetchRunnerAvailability', () => {
  it('returns availability flags when version exists', async () => {
    const manifest = [
      {
        version: '3.13.2',
        files: [{ platform: 'linux-x64' }, { platform: 'darwin-arm64' }, { platform: 'win32-x64' }],
      },
      {
        version: '3.12.6',
        files: [{ platform: 'linux-x64' }],
      },
    ];

    const fetchMock = async (): Promise<Response> => createResponse(manifest);

    const result = await fetchRunnerAvailability('3.13.2', { fetchImpl: fetchMock });

    expect(result).toEqual({
      version: '3.13.2',
      availableOn: {
        linux: true,
        mac: true,
        win: true,
      },
    });
  });

  it('returns null when version is not present in manifest', async () => {
    const manifest = [
      {
        version: '3.12.6',
        files: [{ platform: 'linux-x64' }],
      },
    ];

    const fetchMock = async (): Promise<Response> => createResponse(manifest);

    const result = await fetchRunnerAvailability('3.13.0', { fetchImpl: fetchMock });
    expect(result).toBeNull();
  });

  it('throws on invalid manifest schema', async () => {
    const fetchMock = async (): Promise<Response> => createResponse({});

    await expect(fetchRunnerAvailability('3.13.0', { fetchImpl: fetchMock })).rejects.toThrow(
      /invalid versions manifest/i,
    );
  });

  it('throws when manifest request fails', async () => {
    const fetchMock = async (): Promise<Response> => createResponse({}, 500);

    await expect(fetchRunnerAvailability('3.13.0', { fetchImpl: fetchMock })).rejects.toThrow(
      /status 500/,
    );
  });
});
