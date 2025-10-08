import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { discoverFiles } from './glob-discovery';
import { findPythonVersionMatches, type VersionMatch } from './patterns/python-version';

export interface ScanOptions {
  /** Absolute root directory to scan. */
  root: string;
  /** Glob patterns to include relative to the root. */
  patterns: string[];
  /** Additional ignore patterns. */
  ignore?: string[];
  /** Follow symbolic links. Defaults to false. */
  followSymbolicLinks?: boolean;
}

export interface ScanResult {
  filesScanned: number;
  matches: VersionMatch[];
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function scanForPythonVersions(options: ScanOptions): Promise<ScanResult> {
  const { root, patterns, ignore, followSymbolicLinks } = options;
  const relativeFiles = await discoverFiles({
    root,
    patterns,
    ignore,
    followSymbolicLinks,
  });

  const matches: VersionMatch[] = [];
  let filesScanned = 0;

  for (const relative of relativeFiles) {
    const absolute = path.join(root, relative);
    const content = await readFileSafe(absolute);
    if (content === null) {
      continue;
    }

    filesScanned += 1;
    const fileMatches = findPythonVersionMatches(relative, content);
    matches.push(
      ...fileMatches.map((match) => ({
        ...match,
        file: relative,
      })),
    );
  }

  matches.sort((a, b) => {
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) {
      return fileCompare;
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    if (a.column !== b.column) {
      return a.column - b.column;
    }
    return 0;
  });

  return { filesScanned, matches };
}
