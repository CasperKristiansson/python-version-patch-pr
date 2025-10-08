import { describe, expect, it } from 'vitest';

import { runDryRun } from '../src/rewriter';

const createContext = (
  content: string,
  fromVersion: string,
  toVersion: string,
  filePath = 'Dockerfile',
): Parameters<typeof runDryRun>[number]['contexts'][number] => ({
  originalContent: content,
  fromVersion,
  toVersion,
  filePath,
});

describe('runDryRun', () => {
  it('reports no changes when patches are empty', () => {
    const result = runDryRun({
      contexts: [createContext('python=3.11.8', '3.11.9', '3.11.10')],
    });

    expect(result.changedFiles).toHaveLength(0);
    expect(result.summary).toContain('No changes would be applied');
  });

  it('summarizes changed files and replacements', () => {
    const result = runDryRun({
      contexts: [
        createContext('dependencies:\n  - python=3.11.8\n', '3.11.8', '3.11.9', 'environment.yml'),
        createContext('FROM python:3.10.6-slim', '3.10.6', '3.10.7', 'Dockerfile'),
      ],
    });

    expect(result.changedFiles.sort()).toEqual(['Dockerfile', 'environment.yml']);
    expect(result.summary).toContain('2 file(s) would be updated');
    expect(result.summary).toContain('3.11.8 -> 3.11.9');
    expect(result.summary).toContain('3.10.6 -> 3.10.7');
  });
});
