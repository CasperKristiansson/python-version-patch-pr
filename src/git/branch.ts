import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface BranchCommitOptions {
  repoPath: string;
  track: string;
  files: string[];
  commitMessage: string;
  branchPrefix?: string;
  authorName?: string;
  authorEmail?: string;
}

export interface BranchCommitResult {
  branch: string;
  commitCreated: boolean;
  filesCommitted: string[];
}

export interface PushBranchOptions {
  repoPath: string;
  branch: string;
  remote?: string;
  forceWithLease?: boolean;
  setUpstream?: boolean;
}

async function branchExists(branch: string, repoPath: string): Promise<boolean> {
  try {
    await runGit(['show-ref', '--verify', `refs/heads/${branch}`], repoPath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(
  args: string[],
  repoPath: string,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: repoPath,
    env: {
      ...process.env,
      LC_ALL: 'C',
    },
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function stageFiles(files: string[], repoPath: string): Promise<void> {
  if (files.length === 0) {
    return;
  }
  await runGit(['add', '--', ...files], repoPath);
}

async function getStagedFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await runGit(['diff', '--cached', '--name-only'], repoPath);
  if (!stdout) {
    return [];
  }
  return stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function createBranchAndCommit(
  options: BranchCommitOptions,
): Promise<BranchCommitResult> {
  const {
    repoPath,
    track,
    files,
    commitMessage,
    branchPrefix = 'chore/bump-python-',
    authorName,
    authorEmail,
  } = options;

  const branch = `${branchPrefix}${track}`;

  if (await branchExists(branch, repoPath)) {
    await runGit(['checkout', branch], repoPath);
  } else {
    await runGit(['checkout', '-B', branch], repoPath);
  }
  await stageFiles(files, repoPath);
  const stagedFiles = await getStagedFiles(repoPath);

  if (stagedFiles.length === 0) {
    return { branch, commitCreated: false, filesCommitted: [] };
  }

  const env = { ...process.env };
  if (authorName) {
    env.GIT_AUTHOR_NAME = authorName;
    env.GIT_COMMITTER_NAME = authorName;
  }
  if (authorEmail) {
    env.GIT_AUTHOR_EMAIL = authorEmail;
    env.GIT_COMMITTER_EMAIL = authorEmail;
  }

  await execFileAsync('git', ['commit', '-m', commitMessage], {
    cwd: repoPath,
    env,
  });

  return { branch, commitCreated: true, filesCommitted: stagedFiles };
}

export async function pushBranch(options: PushBranchOptions): Promise<void> {
  const {
    repoPath,
    branch,
    remote = 'origin',
    forceWithLease = true,
    setUpstream = true,
  } = options;

  const args = ['push'];

  if (setUpstream) {
    args.push('--set-upstream');
  }

  if (forceWithLease) {
    args.push('--force-with-lease');
  }

  args.push(remote, branch);

  await runGit(args, repoPath);
}
