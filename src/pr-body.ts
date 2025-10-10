interface GeneratePullRequestBodyOptions {
  track: string;
  newVersion: string;
  filesChanged: string[];
  branchName: string;
  defaultBranch: string;
  skippedWorkflowFiles?: string[];
}

export function generatePullRequestBody(options: GeneratePullRequestBodyOptions): string {
  const { track, newVersion, filesChanged, branchName, defaultBranch, skippedWorkflowFiles } =
    options;

  const filesSection = filesChanged.length
    ? filesChanged.map((file) => `- \`${file}\``).join('\n')
    : 'No files were modified in this bump.';

  const bodySections = [
    '## Summary',
    '',
    `- Bump CPython ${track} pins to \`${newVersion}\`.`,
    '',
    '## Files Updated',
    '',
    filesSection,
    '',
  ];

  if (skippedWorkflowFiles && skippedWorkflowFiles.length > 0) {
    bodySections.push(
      '## ⚠️ Workflow File Notice',
      '',
      'The following workflow files were detected but left unchanged because the provided token lacks the `workflow` scope:',
      '',
      ...skippedWorkflowFiles.map((file) => `- \`${file}\``),
      '',
      'Provide a personal access token with the `workflow` scope (for example via `GITHUB_TOKEN`) before rerunning to update these files automatically.',
      '',
    );
  }

  bodySections.push(
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
  );

  return bodySections.join('\n');
}
