import { fetch as undiciFetch, RequestInit, Response } from 'undici';

const CPYTHON_RELEASE_URL = 'https://api.github.com/repos/python/cpython/releases/tags/';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchReleaseNotesOptions {
  token?: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  userAgent?: string;
}

const defaultFetch = (globalThis.fetch ?? undiciFetch) as FetchLike;

interface GitHubReleasePayload {
  body?: unknown;
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

export async function fetchReleaseNotes(
  tagName: string,
  options: FetchReleaseNotesOptions = {},
): Promise<string | null> {
  const normalizedTag = tagName.trim();
  if (normalizedTag === '') {
    throw new Error('tagName is required to fetch release notes.');
  }

  const { token, fetchImpl = defaultFetch, signal, userAgent } = options;
  const url = `${CPYTHON_RELEASE_URL}${encodeURIComponent(normalizedTag)}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: buildHeaders(token, userAgent),
    signal,
  } satisfies RequestInit);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch release notes for ${normalizedTag} (status ${response.status}).`);
  }

  const payload = (await response.json()) as GitHubReleasePayload;
  return typeof payload.body === 'string' ? payload.body : null;
}
