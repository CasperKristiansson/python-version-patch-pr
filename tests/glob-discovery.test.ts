import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { discoverFiles } from '../src/scanning/glob-discovery';

let tempDir: string;

const touch = async (filePath: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, 'placeholder');
};

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'glob-discovery-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('discoverFiles', () => {
  it('returns matched files while respecting default ignores', async () => {
    await touch(path.join(tempDir, 'workflow/pipeline.yml'));
    await touch(path.join(tempDir, 'docs/readme.txt'));
    await touch(path.join(tempDir, 'node_modules/package/ignored.yml'));
    await touch(path.join(tempDir, '.git/config'));
    await touch(path.join(tempDir, 'dist/output.txt'));

    const files = await discoverFiles({
      root: tempDir,
      patterns: ['**/*.yml', '**/*.txt'],
    });

    expect(files).toEqual(['docs/readme.txt', 'workflow/pipeline.yml']);
  });

  it('supports additional ignore patterns', async () => {
    await touch(path.join(tempDir, 'src/app.py'));
    await touch(path.join(tempDir, 'src/tests/app_test.py'));

    const files = await discoverFiles({
      root: tempDir,
      patterns: ['**/*.py'],
      ignore: ['**/tests/**'],
    });

    expect(files).toEqual(['src/app.py']);
  });

  it('throws when no patterns are provided', async () => {
    await expect(
      discoverFiles({
        root: tempDir,
        patterns: [],
      }),
    ).rejects.toThrow(/at least one glob pattern/);
  });
});
