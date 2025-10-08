import { describe, expect, it } from 'vitest';

import { computePatch } from '../src/rewriter/patch';

const createContext = (
  content: string,
  fromVersion: string,
  toVersion: string,
): Parameters<typeof computePatch>[0] => ({
  filePath: 'Dockerfile',
  originalContent: content,
  fromVersion,
  toVersion,
});

describe('computePatch', () => {
  it('replaces matching versions while preserving suffixes', () => {
    const context = createContext(
      'FROM python:3.12.5-slim\nARG PYTHON_VERSION="3.12.5"',
      '3.12.5',
      '3.12.6',
    );

    const result = computePatch(context);

    expect(result.changed).toBe(true);
    expect(result.updatedContent).toBe('FROM python:3.12.6-slim\nARG PYTHON_VERSION="3.12.6"');
    expect(result.replacements).toHaveLength(2);
  });

  it('ignores files without matches', () => {
    const context = createContext('python=3.12.5', '3.13.1', '3.13.2');

    const result = computePatch(context);

    expect(result.changed).toBe(false);
    expect(result.updatedContent).toBe(context.originalContent);
  });

  it('skips replacements when track differs', () => {
    const context = createContext('python=3.12.5', '3.12.5', '3.13.1');

    const result = computePatch(context);

    expect(result.changed).toBe(false);
    expect(result.updatedContent).toBe(context.originalContent);
  });
});
