import { describe, expect, it, vi } from 'vitest';

const missingError = Object.assign(new Error('missing'), { code: 'ENOENT' });

describe('scanForPythonVersions error handling', () => {
  it('ignores files that cannot be read', async () => {
    vi.resetModules();
    vi.mock('../src/scanning/glob-discovery', () => ({
      __esModule: true,
      discoverFiles: vi.fn(async () => ['missing.txt']),
    }));
    vi.mock('node:fs/promises', () => ({
      __esModule: true,
      readFile: vi.fn(async () => {
        throw missingError;
      }),
    }));

    const { scanForPythonVersions } = await import('../src/scanning/scanner');
    const result = await scanForPythonVersions({ root: '.', patterns: ['missing.txt'] });

    expect(result.filesScanned).toBe(0);
    expect(result.matches).toEqual([]);

    vi.unmock('../src/scanning/glob-discovery');
    vi.unmock('node:fs/promises');
  });
});
