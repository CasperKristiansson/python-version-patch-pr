import { fetch as undiciFetch, RequestInit, Response } from 'undici';
import { z } from 'zod';

const MANIFEST_URL =
  'https://raw.githubusercontent.com/actions/python-versions/main/versions-manifest.json';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RunnerAvailabilityOptions {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  noNetworkFallback?: boolean;
  manifestSnapshot?: unknown;
}

export interface RunnerAvailability {
  version: string;
  availableOn: {
    win: boolean;
    mac: boolean;
    linux: boolean;
  };
}

const defaultFetch = (globalThis.fetch ?? undiciFetch) as FetchLike;

const manifestEntrySchema = z.object({
  version: z.string(),
  files: z.array(
    z.object({
      platform: z.string(),
    }),
  ),
});

const manifestSchema = z.array(manifestEntrySchema);

function determineAvailability(files: { platform: string }[]): RunnerAvailability['availableOn'] {
  const availability: RunnerAvailability['availableOn'] = {
    win: false,
    mac: false,
    linux: false,
  };

  for (const file of files) {
    switch (file.platform) {
      case 'win32':
      case 'win32-x64':
      case 'win32-x86':
        availability.win = true;
        break;
      case 'darwin':
      case 'darwin-x64':
      case 'darwin-arm64':
        availability.mac = true;
        break;
      case 'linux':
      case 'linux-x64':
      case 'linux-arm64':
        availability.linux = true;
        break;
      default:
        break;
    }
  }

  return availability;
}

export async function fetchRunnerAvailability(
  version: string,
  options: RunnerAvailabilityOptions = {},
): Promise<RunnerAvailability | null> {
  const { fetchImpl = defaultFetch, signal, noNetworkFallback = false, manifestSnapshot } = options;

  let payload: unknown;

  if (manifestSnapshot !== undefined) {
    payload = manifestSnapshot;
  } else {
    if (noNetworkFallback) {
      throw new Error(
        'Network access disabled via NO_NETWORK_FALLBACK. Provide manifestSnapshot to fetchRunnerAvailability.',
      );
    }

    const response = await fetchImpl(MANIFEST_URL, {
      method: 'GET',
      signal,
    } satisfies RequestInit);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch versions manifest from actions/python-versions (status ${response.status}).`,
      );
    }

    payload = await response.json();
  }

  const manifestResult = manifestSchema.safeParse(payload);

  if (!manifestResult.success) {
    throw new Error('Received invalid versions manifest structure.');
  }

  const entry = manifestResult.data.find((item) => item.version === version);
  if (!entry) {
    return null;
  }

  return {
    version: entry.version,
    availableOn: determineAvailability(entry.files),
  };
}
