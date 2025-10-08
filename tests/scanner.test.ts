import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanForPythonVersions } from '../src/scanning';

describe('scanForPythonVersions', () => {
  let fixturesRoot: string;

  beforeAll(() => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    fixturesRoot = path.join(currentDir, 'fixtures', 'scanner');
  });

  it('discovers Python version matches across supported files', async () => {
    const result = await scanForPythonVersions({
      root: fixturesRoot,
      patterns: ['**/*'],
    });

    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: '.github/workflows/ci.yml', matched: '3.12.2' }),
        expect.objectContaining({ file: '.python-version', matched: '3.10.12' }),
        expect.objectContaining({ file: '.tool-versions', matched: '3.9.18' }),
        expect.objectContaining({ file: 'Dockerfile', matched: '3.13.4' }),
        expect.objectContaining({ file: 'Dockerfile', matched: '3.8.19' }),
        expect.objectContaining({ file: 'environment.yml', matched: '3.12.1' }),
        expect.objectContaining({ file: 'pyproject.toml', matched: '3.7.17' }),
        expect.objectContaining({ file: 'runtime.txt', matched: '3.11.8' }),
      ]),
    );
  });
});
