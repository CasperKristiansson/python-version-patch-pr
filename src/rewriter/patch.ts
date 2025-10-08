import { findPythonVersionMatches, type VersionMatch } from '../scanning';

export interface RewriteContext {
  filePath: string;
  originalContent: string;
  fromVersion: string;
  toVersion: string;
}

export interface PatchResult {
  filePath: string;
  originalContent: string;
  updatedContent: string;
  changed: boolean;
  replacements: VersionMatch[];
  fromVersion: string;
  toVersion: string;
}

function shareTrack(fromVersion: string, toVersion: string): boolean {
  const fromParts = fromVersion.split('.');
  const toParts = toVersion.split('.');
  return fromParts[0] === toParts[0] && fromParts[1] === toParts[1];
}

export function computePatch(context: RewriteContext): PatchResult {
  const { filePath, originalContent, fromVersion, toVersion } = context;

  if (!shareTrack(fromVersion, toVersion)) {
    return {
      filePath,
      originalContent,
      updatedContent: originalContent,
      changed: false,
      replacements: [],
      fromVersion,
      toVersion,
    };
  }

  const matches = findPythonVersionMatches(filePath, originalContent);
  const replacements = matches.filter((match) => match.matched === fromVersion);

  if (replacements.length === 0) {
    return {
      filePath,
      originalContent,
      updatedContent: originalContent,
      changed: false,
      replacements: [],
      fromVersion,
      toVersion,
    };
  }

  const sortedReplacements = [...replacements].sort((a, b) => a.index - b.index);

  let cursor = 0;
  let updatedContent = '';
  for (const replacement of sortedReplacements) {
    const start = replacement.index;
    const end = start + fromVersion.length;
    updatedContent += originalContent.slice(cursor, start);
    updatedContent += toVersion;
    cursor = end;
  }
  updatedContent += originalContent.slice(cursor);

  const changed = cursor !== 0 && updatedContent !== originalContent;

  return {
    filePath,
    originalContent,
    updatedContent,
    changed,
    replacements,
    fromVersion,
    toVersion,
  };
}
