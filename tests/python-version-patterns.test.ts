import { describe, expect, it } from 'vitest';

import { findPythonVersionMatches } from '../src/scanning/patterns/python-version';

describe('findPythonVersionMatches', () => {
  it('detects python-version inputs inside workflow files', () => {
    const content = `jobs:\n  build:\n    steps:\n      - uses: actions/setup-python@v4\n        with:\n          python-version: "3.13.2"`;

    const matches = findPythonVersionMatches('.github/workflows/ci.yml', content);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matched).toBe('3.13.2');
  });

  it('captures versions within Dockerfiles', () => {
    const content = `FROM python:3.13.2-slim\nARG PYTHON_VERSION="3.12.8"\nENV PYTHON_VERSION=3.12.8`;

    const matches = findPythonVersionMatches('Dockerfile', content);

    expect(matches.map((match) => match.matched)).toEqual(['3.13.2', '3.12.8', '3.12.8']);
  });

  it('reads the version from .python-version files', () => {
    const matches = findPythonVersionMatches('.python-version', '3.10.14\n');

    expect(matches).toEqual([
      expect.objectContaining({ matched: '3.10.14', major: 3, minor: 10, patch: 14 }),
    ]);
  });

  it('handles .tool-versions python entries', () => {
    const content = 'python 3.11.9\nnodejs 20.12.2';
    const matches = findPythonVersionMatches('.tool-versions', content);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matched).toBe('3.11.9');
  });

  it('detects runtime.txt versions', () => {
    const matches = findPythonVersionMatches('runtime.txt', 'python-3.8.19');

    expect(matches).toEqual([expect.objectContaining({ matched: '3.8.19', minor: 8 })]);
  });

  it('finds pinned versions in pyproject.toml', () => {
    const content = `requires-python = "==3.9.18"\npython = "==3.9.18"`;
    const matches = findPythonVersionMatches('pyproject.toml', content);

    expect(matches.map((match) => match.matched)).toEqual(['3.9.18', '3.9.18']);
  });

  it('captures pythonVersion entries in pyproject tool tables', () => {
    const content = `[tool.pyright]\npythonVersion = "3.10.8"`;
    const matches = findPythonVersionMatches('pyproject.toml', content);

    expect(matches.map((match) => match.matched)).toEqual(['3.10.8']);
  });

  it('finds pinned versions in tox.ini', () => {
    const content = `python_version = 3.7.17\nbasepython = python3.7.17`;
    const matches = findPythonVersionMatches('tox.ini', content);

    expect(matches.map((match) => match.matched)).toEqual(['3.7.17', '3.7.17']);
  });

  it('finds pinned versions in Pipfile', () => {
    const content = `[requires]\npython_full_version = "3.12.1"\npython_version = "3.12.1"`;
    const matches = findPythonVersionMatches('Pipfile', content);

    expect(matches.map((match) => match.matched)).toEqual(['3.12.1', '3.12.1']);
  });

  it('finds pinned versions in environment.yml', () => {
    const content = 'dependencies:\n  - python=3.9.18\n  - numpy=1.24.0';
    const matches = findPythonVersionMatches('environment.yml', content);

    expect(matches.map((match) => match.matched)).toEqual(['3.9.18']);
  });

  it('ignores non-patch versions', () => {
    const content = 'python-version: "3.13"\npython=3.13\npython 3.13';
    const matches = findPythonVersionMatches('.github/workflows/ci.yml', content);

    expect(matches).toHaveLength(0);
  });
});
