import fg from 'fast-glob';

interface DiscoverFilesOptions {
  /** Absolute path to the root directory where globbing should occur. */
  root: string;
  /** Glob patterns to match relative to the root. */
  patterns: string[];
  /** Additional ignore globs to apply on top of the defaults. */
  ignore?: string[];
  /** Whether to follow symbolic links. Defaults to false. */
  followSymbolicLinks?: boolean;
}

const DEFAULT_IGNORES = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

export async function discoverFiles(options: DiscoverFilesOptions): Promise<string[]> {
  const { root, patterns, ignore = [], followSymbolicLinks = false } = options;

  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error('discoverFiles requires at least one glob pattern.');
  }

  const entries = await fg(patterns, {
    cwd: root,
    ignore: [...DEFAULT_IGNORES, ...ignore],
    followSymbolicLinks,
    dot: true,
    onlyFiles: true,
    unique: true,
  });

  return [...entries].sort();
}
