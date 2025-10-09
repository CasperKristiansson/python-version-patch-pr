interface GeneratePullRequestBodyOptions {
  track: string;
  newVersion: string;
  filesChanged: string[];
  branchName: string;
  defaultBranch: string;
}

export function generatePullRequestBody(options: GeneratePullRequestBodyOptions): string {
  const { track, newVersion, filesChanged, branchName, defaultBranch } = options;

  const filesSection = filesChanged.length
    ? filesChanged.map((file) => `- \`${file}\``).join('\n')
    : 'No files were modified in this bump.';

  return [
    '## Summary',
    '',
    `- Bump CPython ${track} pins to \`${newVersion}\`.`,
    '',
    '## Files Updated',
    '',
    filesSection,
    '',
    '## Rollback',
    '',
    'Before merge, close this PR and delete the branch:',
    '',
    '```sh',
    `git push origin --delete ${branchName}`,
    '```',
    '',
    `After merge, revert the change on ${defaultBranch}:`,
    '',
    '```sh',
    `git checkout ${defaultBranch}`,
    `git pull --ff-only origin ${defaultBranch}`,
    'git revert --no-edit <merge_commit_sha>',
    `git push origin ${defaultBranch}`,
    '```',
    '',
    'Replace `<merge_commit_sha>` with the SHA of the merge commit if rollback is required.',
  ].join('\n');
}
