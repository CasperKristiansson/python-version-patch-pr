import type { PatchResult } from './patch';

export interface IdempotenceResult {
  alreadyLatest: boolean;
  matchedFiles: string[];
}

export function evaluateIdempotence(patches: PatchResult[]): IdempotenceResult {
  const matchedFiles = Array.from(
    new Set(
      patches.filter((patch) => patch.replacements.length > 0).map((patch) => patch.filePath),
    ),
  ).sort();

  const hasChanges = patches.some((patch) => patch.changed);
  const alreadyLatest = matchedFiles.length > 0 && !hasChanges;

  return { alreadyLatest, matchedFiles };
}
