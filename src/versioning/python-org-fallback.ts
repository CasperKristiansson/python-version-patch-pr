import { load } from 'cheerio';
import semver from 'semver';
import { fetch as undiciFetch, RequestInit, Response } from 'undici';

const PYTHON_RELEASES_URL = 'https://www.python.org/downloads/source/';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PythonOrgFallbackOptions {
  fetchImpl?: FetchLike;
  track: string;
  noNetworkFallback?: boolean;
  htmlSnapshot?: string;
}

export interface PythonOrgVersion {
  version: string;
}

const defaultFetch = (globalThis.fetch ?? undiciFetch) as FetchLike;

function extractVersions(html: string): string[] {
  const $ = load(html);
  const versions = new Set<string>();

  $('a').each((_idx, element) => {
    const text = $(element).text().trim();
    const normalized = text.startsWith('Python ') ? text.substring(7) : text;
    const parsed = semver.coerce(normalized);
    if (parsed) {
      versions.add(parsed.version);
    }
  });

  return [...versions];
}

export async function fetchLatestFromPythonOrg(
  options: PythonOrgFallbackOptions,
): Promise<PythonOrgVersion | null> {
  const { track, fetchImpl = defaultFetch, noNetworkFallback = false, htmlSnapshot } = options;
  const normalizedTrack = track.trim();
  if (!/^\d+\.\d+$/.test(normalizedTrack)) {
    throw new Error(`Track "${track}" must be in the form X.Y`);
  }

  let htmlContent: string;

  if (htmlSnapshot) {
    htmlContent = htmlSnapshot;
  } else {
    if (noNetworkFallback) {
      throw new Error(
        'Network access disabled via NO_NETWORK_FALLBACK. Provide htmlSnapshot to fetchLatestFromPythonOrg.',
      );
    }

    const response = await fetchImpl(PYTHON_RELEASES_URL, {
      method: 'GET',
    } satisfies RequestInit);

    if (!response.ok) {
      throw new Error(`Failed to fetch python.org releases (status ${response.status}).`);
    }

    htmlContent = await response.text();
  }

  const versions = extractVersions(htmlContent);

  const candidates = versions.filter((version) => version.startsWith(`${normalizedTrack}.`));
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => semver.rcompare(a, b));
  return { version: candidates[0] };
}
