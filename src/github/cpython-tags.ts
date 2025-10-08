import { fetch as undiciFetch, RequestInit, Response } from 'undici';
import semver, { SemVer } from 'semver';

const CPYTHON_TAGS_URL = 'https://api.github.com/repos/python/cpython/tags';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface StableTag {
  tagName: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  commitSha: string;
}

export interface FetchStableTagsOptions {
  token?: string;
  perPage?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  userAgent?: string;
}

const defaultFetch = (globalThis.fetch ?? undiciFetch) as FetchLike;

interface GitHubTag {
  name?: unknown;
  commit?: {
    sha?: unknown;
  };
}

function buildHeaders(token?: string, userAgent?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': userAgent ?? 'python-version-patch-pr/0.1.0',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function parseStableVersion(tagName: string): SemVer | null {
  let normalized = tagName.trim();
  if (normalized.startsWith('refs/tags/')) {
    normalized = normalized.substring('refs/tags/'.length);
  }
  if (normalized.startsWith('v')) {
    normalized = normalized.substring(1);
  }

  const parsed = semver.parse(normalized);
  if (!parsed || parsed.prerelease.length > 0) {
    return null;
  }

  return parsed;
}

export async function fetchStableCpythonTags(
  options: FetchStableTagsOptions = {},
): Promise<StableTag[]> {
  const { token, perPage = 100, fetchImpl = defaultFetch, signal, userAgent } = options;

  if (perPage <= 0) {
    throw new Error('perPage must be greater than zero.');
  }

  const results: StableTag[] = [];
  let page = 1;

  while (true) {
    const url = new URL(CPYTHON_TAGS_URL);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: buildHeaders(token, userAgent),
      signal,
    } satisfies RequestInit);

    if (!response.ok) {
      throw new Error(`Failed to fetch CPython tags from GitHub (status ${response.status}).`);
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      throw new Error('Unexpected payload when fetching CPython tags from GitHub.');
    }

    let addedForPage = 0;

    for (const entry of payload) {
      const tag = entry as GitHubTag;
      if (typeof tag.name !== 'string' || typeof tag.commit?.sha !== 'string') {
        continue;
      }

      const parsed = parseStableVersion(tag.name);
      if (!parsed) {
        continue;
      }

      results.push({
        tagName: tag.name,
        version: parsed.version,
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        commitSha: tag.commit.sha,
      });
      addedForPage += 1;
    }

    if (payload.length < perPage) {
      break;
    }

    // Guard against infinite loops if GitHub returns empty arrays equal to perPage.
    if (payload.length === 0 || addedForPage === 0) {
      break;
    }

    page += 1;
  }

  results.sort((a, b) => semver.rcompare(a.version, b.version));
  return results;
}
