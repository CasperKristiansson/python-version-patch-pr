import semver from 'semver';

import type { FetchStableTagsOptions, StableTag } from '../github';
import { fetchStableCpythonTags } from '../github';

export interface ResolveLatestPatchOptions extends FetchStableTagsOptions {
  /// When true, include pre-release versions in the output. Defaults to false.
  includePrerelease?: boolean;
  /// Optional override for the tag list, used primarily for testing.
  tags?: StableTag[];
}

export interface LatestPatchResult {
  /// Resolved CPython version, e.g. 3.13.2.
  version: string;
  /// Underlying tag name on GitHub.
  tagName: string;
  /// Commit SHA associated with the tag.
  commitSha: string;
}

function filterByTrack(tags: StableTag[], track: string, includePrerelease: boolean): StableTag[] {
  return tags.filter((tag) => {
    const matchesTrack = `${tag.major}.${tag.minor}` === track;
    if (!matchesTrack) {
      return false;
    }

    if (includePrerelease) {
      return true;
    }

    return semver.prerelease(tag.version) === null;
  });
}

export async function resolveLatestPatch(
  track: string,
  options: ResolveLatestPatchOptions = {},
): Promise<LatestPatchResult | null> {
  const normalizedTrack = track.trim();
  if (!/^[0-9]+\.[0-9]+$/.test(normalizedTrack)) {
    throw new Error(`Track "${track}" must be in the form X.Y`);
  }

  const { includePrerelease = false, tags, ...fetchOptions } = options;

  const stableTags = tags ?? (await fetchStableCpythonTags(fetchOptions));
  const candidates = filterByTrack(stableTags, normalizedTrack, includePrerelease);

  if (candidates.length === 0) {
    return null;
  }

  const latest = candidates.reduce((acc, current) =>
    semver.gt(current.version, acc.version) ? current : acc,
  );

  return {
    version: latest.version,
    tagName: latest.tagName,
    commitSha: latest.commitSha,
  };
}
