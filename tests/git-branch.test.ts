import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createBranchAndCommit } from '../src/git';

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

describe('createBranchAndCommit', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(path.join(tmpdir(), 'git-branch-'));
    await runGit(['init'], repoDir);
    await runGit(['config', 'user.name', 'Test User'], repoDir);
    await runGit(['config', 'user.email', 'test@example.com'], repoDir);

    const filePath = path.join(repoDir, 'README.md');
    await writeFile(filePath, 'initial\n');
    await runGit(['add', 'README.md'], repoDir);
    await runGit(['commit', '-m', 'Initial commit'], repoDir);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('creates branch and commits staged changes', async () => {
    const filePath = path.join(repoDir, 'Dockerfile');
    await writeFile(filePath, 'FROM python:3.11.8-slim\n');

    const result = await createBranchAndCommit({
      repoPath: repoDir,
      track: '3.11',
      files: ['Dockerfile'],
      commitMessage: 'chore: bump python to 3.11.9',
      authorName: 'Python Bot',
      authorEmail: 'bot@example.com',
    });

    expect(result.branch).toBe('chore/bump-python-3.11');
    expect(result.commitCreated).toBe(true);
    expect(result.filesCommitted).toEqual(['Dockerfile']);

    const currentBranch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
    expect(currentBranch).toBe('chore/bump-python-3.11');

    const lastCommit = await runGit(['log', '-1', '--pretty=%s'], repoDir);
    expect(lastCommit).toBe('chore: bump python to 3.11.9');
  });

  it('skips commit when no changes staged', async () => {
    const result = await createBranchAndCommit({
      repoPath: repoDir,
      track: '3.12',
      files: ['README.md'],
      commitMessage: 'chore: noop commit',
    });

    expect(result.commitCreated).toBe(false);
    expect(result.filesCommitted).toEqual([]);

    const currentBranch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
    expect(currentBranch).toBe('chore/bump-python-3.12');

    const status = await runGit(['status', '--short'], repoDir);
    expect(status).toBe('');
  });

  it('reuses existing branch when present', async () => {
    const filePath = path.join(repoDir, 'Dockerfile');
    await writeFile(filePath, 'FROM python:3.11.8-slim\n');

    // First run creates the branch and commit.
    await createBranchAndCommit({
      repoPath: repoDir,
      track: '3.11',
      files: ['Dockerfile'],
      commitMessage: 'chore: bump python to 3.11.9',
    });

    // Modify file again and ensure second run keeps branch without recreation errors.
    await writeFile(filePath, 'FROM python:3.11.9-slim\n');

    const result = await createBranchAndCommit({
      repoPath: repoDir,
      track: '3.11',
      files: ['Dockerfile'],
      commitMessage: 'chore: bump python to 3.11.10',
    });

    expect(result.branch).toBe('chore/bump-python-3.11');
    const commitCount = await runGit(['rev-list', '--count', 'chore/bump-python-3.11'], repoDir);
    expect(Number.parseInt(commitCount, 10)).toBeGreaterThanOrEqual(2);
  });
});
