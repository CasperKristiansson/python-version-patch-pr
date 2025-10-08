import * as core from '@actions/core';

const DEFAULT_TRACK = '3.13';
const DEFAULT_PATHS = [
  '.github/workflows/**/*.yml',
  'Dockerfile',
  '**/Dockerfile',
  '**/*.python-version',
  '**/runtime.txt',
  '**/pyproject.toml',
];

function getBooleanInput(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name).trim().toLowerCase();
  if (raw === '') {
    return fallback;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  core.warning(`Input "${name}" received unexpected value "${raw}". Falling back to ${fallback}.`);
  return fallback;
}

function resolvePathsInput(): string[] {
  const explicitPaths = core.getMultilineInput('paths', { trimWhitespace: true }).filter(Boolean);
  return explicitPaths.length > 0 ? explicitPaths : DEFAULT_PATHS;
}

export async function run(): Promise<void> {
  try {
    const trackInput = core.getInput('track').trim();
    const track = trackInput === '' ? DEFAULT_TRACK : trackInput;

    const includePrerelease = getBooleanInput('include_prerelease', false);
    const automerge = getBooleanInput('automerge', false);
    const dryRun = getBooleanInput('dry_run', false);
    const effectivePaths = resolvePathsInput();

    core.startGroup('Configuration');
    core.info(`track: ${track}`);
    core.info(`include_prerelease: ${includePrerelease}`);
    core.info(`paths (${effectivePaths.length}): ${effectivePaths.join(', ')}`);
    core.info(`automerge: ${automerge}`);
    core.info(`dry_run: ${dryRun}`);
    core.endGroup();

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

if (require.main === module) {
  void run();
}
