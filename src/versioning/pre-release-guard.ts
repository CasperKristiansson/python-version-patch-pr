import semver from 'semver';

export interface PreReleaseGuardResult {
  allowed: boolean;
  reason?: 'pre_release_guarded';
}

export function enforcePreReleaseGuard(
  includePrerelease: boolean,
  version: string | null,
): PreReleaseGuardResult {
  if (version === null) {
    return { allowed: true };
  }

  const parsed = semver.parse(version, { includePrerelease: true, loose: true });
  if (!parsed) {
    return { allowed: true };
  }

  const isPreRelease = parsed.prerelease.length > 0;
  if (isPreRelease && !includePrerelease) {
    return { allowed: false, reason: 'pre_release_guarded' };
  }

  return { allowed: true };
}
