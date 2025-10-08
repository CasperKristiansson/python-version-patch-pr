import * as core from '@actions/core';

async function run(): Promise<void> {
  try {
    const track = core.getInput('track') || '3.13';
    const includePrerelease =
      core.getInput('include_prerelease').toLowerCase() === 'true';
    const paths =
      core
        .getMultilineInput('paths', { trimWhitespace: true })
        .filter(Boolean) || [];
    const automerge = core.getInput('automerge').toLowerCase() === 'true';
    const dryRun = core.getInput('dry_run').toLowerCase() === 'true';

    const effectivePaths =
      paths.length > 0
        ? paths
        : [
            '.github/workflows/**/*.yml',
            '**/Dockerfile',
            '**/.python-version',
            '**/runtime.txt',
            '**/pyproject.toml'
          ];

    core.startGroup('Configuration');
    core.info(`track: ${track}`);
    core.info(`include_prerelease: ${includePrerelease}`);
    core.info(
      `paths (${effectivePaths.length}): ${effectivePaths.join(', ')}`
    );
    core.info(`automerge: ${automerge}`);
    core.info(`dry_run: ${dryRun}`);
    core.endGroup();

    // Placeholder output until the implementation is completed in later tasks.
    core.info('CPython Patch PR Action placeholder executing.');
    core.setOutput('new_version', '');
    core.setOutput('files_changed', JSON.stringify([]));
    core.setOutput('skipped_reason', 'not_implemented');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error');
    }
  }
}

void run();
