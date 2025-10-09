import { beforeEach, describe, expect, it, vi } from 'vitest';

const octokitModule = vi.hoisted(() => {
  const list = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const Octokit = vi.fn().mockImplementation(() => ({ pulls: { list, create, update } }));
  return { Octokit, list, create, update };
});

vi.mock('@octokit/rest', () => ({
  __esModule: true,
  Octokit: octokitModule.Octokit,
}));

import { createOrUpdatePullRequest, type OctokitClient, type PullRequestOptions } from '../src/git';

const createClient = (): {
  client: OctokitClient;
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} => {
  const list = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const client: OctokitClient = {
    pulls: {
      list,
      create,
      update,
    },
  };
  return { client, list, create, update };
};

const baseOptions: PullRequestOptions = {
  owner: 'example',
  repo: 'repo',
  head: 'feature',
  base: 'main',
  title: 'Update Python',
  body: 'Details',
  authToken: 'token',
};

describe('createOrUpdatePullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new pull request when none exist', async () => {
    const { client, list, create } = createClient();
    list.mockResolvedValue({ data: [] });
    create.mockResolvedValue({ data: { number: 42, html_url: 'https://pr/42' } });

    const result = await createOrUpdatePullRequest({ ...baseOptions, client });

    expect(list).toHaveBeenCalledWith({
      owner: 'example',
      repo: 'repo',
      head: 'example:feature',
      state: 'open',
      per_page: 1,
    });
    expect(create).toHaveBeenCalledWith({
      owner: 'example',
      repo: 'repo',
      head: 'feature',
      base: 'main',
      title: 'Update Python',
      body: 'Details',
      draft: undefined,
      maintainer_can_modify: undefined,
    });
    expect(result).toEqual({ action: 'created', number: 42, url: 'https://pr/42' });
  });

  it('updates an existing pull request when one is open', async () => {
    const { client, list, update } = createClient();
    list.mockResolvedValue({ data: [{ number: 7, html_url: 'https://pr/7' }] });
    update.mockResolvedValue({ data: { number: 7, html_url: 'https://pr/7' } });

    const result = await createOrUpdatePullRequest({
      ...baseOptions,
      client,
      maintainerCanModify: true,
    });

    expect(update).toHaveBeenCalledWith({
      owner: 'example',
      repo: 'repo',
      pull_number: 7,
      title: 'Update Python',
      body: 'Details',
      maintainer_can_modify: true,
    });
    expect(result).toEqual({ action: 'updated', number: 7, url: 'https://pr/7' });
  });

  it('reuses an existing pull request on subsequent calls', async () => {
    const { client, list, create, update } = createClient();
    list
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ number: 9, html_url: 'https://pr/9' }] });
    create.mockResolvedValue({ data: { number: 9, html_url: 'https://pr/9' } });
    update.mockResolvedValue({ data: { number: 9, html_url: 'https://pr/9' } });

    const first = await createOrUpdatePullRequest({ ...baseOptions, client });
    const second = await createOrUpdatePullRequest({ ...baseOptions, client });

    expect(first.action).toBe('created');
    expect(second.action).toBe('updated');
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('instantiates Octokit when no client is provided', async () => {
    octokitModule.list.mockResolvedValue({ data: [] });
    octokitModule.create.mockResolvedValue({ data: { number: 5, html_url: undefined } });

    const result = await createOrUpdatePullRequest(baseOptions);

    expect(octokitModule.Octokit).toHaveBeenCalledWith({
      auth: 'token',
      userAgent: 'python-version-patch-pr/0.1.0',
    });
    expect(result).toEqual({ action: 'created', number: 5, url: undefined });
  });
});
