import { describe, expect, it, vi } from 'vitest';

const missingError = Object.assign(new Error('missing'), { code: 'ENOENT' });

describe('scanForPythonVersions error handling', () => {
  it('ignores files that cannot be read', async () => {
    vi.resetModules();
    await vi.doMock('../src/scanning/glob-discovery', () => ({
      __esModule: true,
      discoverFiles: vi.fn(async () => ['missing.txt']),
    }));
    await vi.doMock('node:fs/promises', () => ({
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

  it('normalizes Windows-style separators from glob discovery', async () => {
    vi.resetModules();
    const discoverFilesMock = vi.fn(async () => ['.github\\workflows\\ci.yml']);
    await vi.doMock('../src/scanning/glob-discovery', () => ({
      __esModule: true,
      discoverFiles: discoverFilesMock,
    }));
    await vi.doMock('node:fs/promises', () => ({
      __esModule: true,
      readFile: vi.fn(async () => 'python-version: "3.13.2"'),
    }));

    const { scanForPythonVersions } = await import('../src/scanning/scanner');
    const result = await scanForPythonVersions({
      root: '.',
      patterns: ['**/*.yml'],
    });

    expect(discoverFilesMock).toHaveBeenCalled();
    expect(result.filesScanned).toBe(1);
    expect(result.matches).toEqual([
      expect.objectContaining({ file: '.github/workflows/ci.yml', matched: '3.13.2' }),
    ]);

    vi.unmock('../src/scanning/glob-discovery');
    vi.unmock('node:fs/promises');
  });
});
