import type { VersionMatch } from './patterns/python-version';

export interface TrackAlignmentResult {
  track: string | null;
  conflicts: string[];
}

export function determineSingleTrack(matches: VersionMatch[]): TrackAlignmentResult {
  const tracks = new Set<string>();

  for (const match of matches) {
    const track = `${match.major}.${match.minor}`;
    tracks.add(track);
  }

  if (tracks.size === 0) {
    return { track: null, conflicts: [] };
  }

  if (tracks.size === 1) {
    const [single] = tracks;
    return { track: single, conflicts: [] };
  }

  return { track: null, conflicts: Array.from(tracks).sort() };
}
