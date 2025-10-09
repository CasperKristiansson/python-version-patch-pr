import { describe, expect, it } from 'vitest';

import { validateTrack } from '../src/config';

describe('validateTrack', () => {
  it('returns the track when format is valid', () => {
    expect(validateTrack('3.13')).toBe('3.13');
    expect(validateTrack('3.12')).toBe('3.12');
  });

  it('throws an error when track does not match X.Y', () => {
    expect(() => validateTrack('3')).toThrow(/must match X\.Y/i);
    expect(() => validateTrack('3.13.1')).toThrow(/must match X\.Y/i);
    expect(() => validateTrack('banana')).toThrow(/must match X\.Y/i);
  });
});
