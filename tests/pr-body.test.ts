import { describe, expect, it } from 'vitest';

import { generatePullRequestBody } from '../src/pr-body';

describe('generatePullRequestBody', () => {
  it('includes summary, files, and rollback sections', () => {
    const body = generatePullRequestBody({
      track: '3.13',
      newVersion: '3.13.2',
      filesChanged: ['Dockerfile', '.github/workflows/ci.yml'],
      branchName: 'chore/bump-python-3.13',
      defaultBranch: 'main',
    });

    expect(body).toContain('## Summary');
    expect(body).toContain('CPython 3.13 pins to `3.13.2`');
    expect(body).toContain('`Dockerfile`');
    expect(body).toContain('git push origin --delete chore/bump-python-3.13');
    expect(body).toContain('git checkout main');
    expect(body).toContain('git revert --no-edit <merge_commit_sha>');
  });

  it('falls back to message when no files changed', () => {
    const body = generatePullRequestBody({
      track: '3.12',
      newVersion: '3.12.4',
      filesChanged: [],
      branchName: 'chore/bump-python-3.12',
      defaultBranch: 'main',
    });

    expect(body).toContain('No files were modified in this bump.');
  });
});
