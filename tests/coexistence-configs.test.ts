import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'coexistence');

describe('coexistence configuration samples', () => {
  it('renovate sample disables CPython patch bumps', async () => {
    const configText = await readFile(join(examplesDir, 'renovate.json'), 'utf8');
    const config = JSON.parse(configText);

    expect(Array.isArray(config.packageRules)).toBe(true);

    const rule = config.packageRules.find(
      (entry: Record<string, unknown>) =>
        entry.description ===
        'Let python-version-patch-pr handle CPython patch bumps found in Dockerfiles and regex managers',
    ) as Record<string, unknown> | undefined;

    expect(rule).toBeDefined();
    expect(rule?.enabled).toBe(false);
    expect(rule?.matchUpdateTypes).toEqual(['patch']);
    expect(rule?.matchPackagePatterns).toContain('^python$');
  });

  it('dependabot sample ignores CPython patch bump PRs', async () => {
    const configText = await readFile(join(examplesDir, 'dependabot.yml'), 'utf8');
    const config = parse(configText) as { updates?: Array<Record<string, unknown>> };

    expect(Array.isArray(config.updates)).toBe(true);

    const dockerEntry = config.updates?.find((entry) => entry['package-ecosystem'] === 'docker') as
      | Record<string, unknown>
      | undefined;

    expect(dockerEntry).toBeDefined();

    const ignoreList = dockerEntry?.ignore as Array<Record<string, unknown>> | undefined;
    expect(Array.isArray(ignoreList)).toBe(true);

    const pythonIgnore = ignoreList?.find((entry) => entry['dependency-name'] === 'python');

    expect(pythonIgnore).toBeDefined();
    expect(pythonIgnore?.['update-types']).toContain('version-update:semver-patch');
  });
});
