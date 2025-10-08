import { describe, expect, it } from 'vitest';

import type { VersionMatch } from '../src/scanning';
import { determineSingleTrack } from '../src/scanning';

const createMatch = (major: number, minor: number, patch: number): VersionMatch => ({
  file: 'sample.txt',
  line: 1,
  column: 1,
  matched: `${major}.${minor}.${patch}`,
  major,
  minor,
  patch,
});

describe('determineSingleTrack', () => {
  it('returns null when no matches exist', () => {
    const result = determineSingleTrack([]);

    expect(result).toEqual({ track: null, conflicts: [] });
  });

  it('identifies a single track across matches', () => {
    const matches = [createMatch(3, 13, 2), createMatch(3, 13, 4)];

    const result = determineSingleTrack(matches);

    expect(result).toEqual({ track: '3.13', conflicts: [] });
  });

  it('returns conflicts when multiple tracks are present', () => {
    const matches = [createMatch(3, 13, 2), createMatch(3, 12, 8)];

    const result = determineSingleTrack(matches);

    expect(result).toEqual({ track: null, conflicts: ['3.12', '3.13'] });
  });
});
