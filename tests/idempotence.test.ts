import { describe, expect, it } from 'vitest';

import { evaluateIdempotence } from '../src/rewriter';
import type { PatchResult } from '../src/rewriter';

const createPatch = (overrides: Partial<PatchResult>): PatchResult => ({
  filePath: 'example',
  originalContent: 'python=3.11.8',
  updatedContent: 'python=3.11.9',
  changed: true,
  replacements: [],
  fromVersion: '3.11.8',
  toVersion: '3.11.9',
  ...overrides,
});

describe('evaluateIdempotence', () => {
  it('reports already latest when matches exist but no changes', () => {
    const patches = [
      createPatch({
        filePath: 'requirements.txt',
        changed: false,
        replacements: [
          {
            file: 'requirements.txt',
            line: 1,
            column: 8,
            matched: '3.11.8',
            major: 3,
            minor: 11,
            patch: 8,
            index: 8,
          },
        ],
      }),
    ];

    const result = evaluateIdempotence(patches);

    expect(result.alreadyLatest).toBe(true);
    expect(result.matchedFiles).toEqual(['requirements.txt']);
  });

  it('returns false when changes would be applied', () => {
    const patches = [
      createPatch({
        filePath: 'Dockerfile',
        changed: true,
        replacements: [
          {
            file: 'Dockerfile',
            line: 1,
            column: 13,
            matched: '3.12.5',
            major: 3,
            minor: 12,
            patch: 5,
            index: 13,
          },
        ],
      }),
    ];

    const result = evaluateIdempotence(patches);

    expect(result.alreadyLatest).toBe(false);
    expect(result.matchedFiles).toEqual(['Dockerfile']);
  });

  it('returns false when no matches were found', () => {
    const patches = [
      createPatch({
        filePath: 'Dockerfile',
        changed: false,
        replacements: [],
      }),
    ];

    const result = evaluateIdempotence(patches);

    expect(result.alreadyLatest).toBe(false);
    expect(result.matchedFiles).toEqual([]);
  });
});
