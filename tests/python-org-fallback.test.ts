import { describe, expect, it } from 'vitest';
import { Response } from 'undici';

import { fetchLatestFromPythonOrg } from '../src/versioning/python-org-fallback';

const SAMPLE_HTML = `
<html>
  <body>
    <a>Python 3.13.2</a>
    <a href="https://www.python.org/downloads/release/python-3131/">Python 3.13.1</a>
    <a href="https://www.python.org/downloads/release/python-3131rc1/">Python 3.13.1rc1</a>
    <a>Python 3.12.7</a>
    <a>Python 3.13.2rc1</a>
  </body>
</html>
`;

const createResponse = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html' } });

describe('fetchLatestFromPythonOrg', () => {
  it('returns the highest version matching the track', async () => {
    const fetchMock = async (): Promise<Response> => createResponse(SAMPLE_HTML);

    const result = await fetchLatestFromPythonOrg({ track: '3.13', fetchImpl: fetchMock });

    expect(result).toEqual({ version: '3.13.2' });
  });

  it('returns null when no matching versions are found', async () => {
    const fetchMock = async (): Promise<Response> => createResponse(SAMPLE_HTML);

    const result = await fetchLatestFromPythonOrg({ track: '3.11', fetchImpl: fetchMock });

    expect(result).toBeNull();
  });

  it('throws when python.org responds with an error', async () => {
    const fetchMock = async (): Promise<Response> => createResponse('nope', 500);

    await expect(fetchLatestFromPythonOrg({ track: '3.13', fetchImpl: fetchMock })).rejects.toThrow(
      /status 500/,
    );
  });
});
