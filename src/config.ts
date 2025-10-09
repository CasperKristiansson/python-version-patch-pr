import { z } from 'zod';

const trackSchema = z
  .string()
  .regex(/^[0-9]+\.[0-9]+$/, 'Track must be in the form X.Y (for example 3.13).');

export function validateTrack(track: string): string {
  const result = trackSchema.safeParse(track);
  if (!result.success) {
    throw new Error(`Input "track" must match X.Y (e.g. 3.13). Received "${track}".`);
  }

  return result.data;
}
