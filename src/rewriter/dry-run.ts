import type { PatchResult, RewriteContext } from './patch';
import { computePatch } from './patch';

export interface DryRunResult {
  patches: PatchResult[];
  summary: string;
  changedFiles: string[];
}

export interface DryRunOptions {
  contexts: RewriteContext[];
}

export function runDryRun(options: DryRunOptions): DryRunResult {
  const { contexts } = options;
  const patches = contexts.map((context) => computePatch(context));
  const changedFiles = Array.from(
    new Set(patches.filter((patch) => patch.changed).map((patch) => patch.filePath)),
  );

  const summaryLines: string[] = [];
  summaryLines.push('Dry-run summary:');
  if (changedFiles.length === 0) {
    summaryLines.push('  No changes would be applied.');
  } else {
    summaryLines.push(`  ${changedFiles.length} file(s) would be updated:`);
    for (const patch of patches) {
      if (!patch.changed) {
        continue;
      }

      summaryLines.push(`  - ${patch.filePath}`);
      for (const replacement of patch.replacements) {
        summaryLines.push(
          `      ${patch.filePath}:${replacement.line}:${replacement.column} ${replacement.matched} -> ${patch.toVersion}`,
        );
      }
    }
  }

  return {
    patches,
    summary: summaryLines.join('\n'),
    changedFiles,
  };
}
