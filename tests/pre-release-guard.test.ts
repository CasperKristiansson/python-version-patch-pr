import { describe, expect, it } from 'vitest';

import { enforcePreReleaseGuard } from '../src/versioning';

describe('enforcePreReleaseGuard', () => {
  it('blocks pre-release versions when flag is false', () => {
    const result = enforcePreReleaseGuard(false, '3.13.0-rc.1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('pre_release_guarded');
  });

  it('allows pre-release versions when flag is true', () => {
    const result = enforcePreReleaseGuard(true, '3.13.0-rc.1');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows stable versions regardless of flag', () => {
    const result = enforcePreReleaseGuard(false, '3.13.2');

    expect(result.allowed).toBe(true);
  });

  it('allows when version is null', () => {
    const result = enforcePreReleaseGuard(false, null);

    expect(result.allowed).toBe(true);
  });
});
