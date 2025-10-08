import { Octokit } from '@octokit/rest';

export interface OctokitClient {
  pulls: {
    list: (params: {
      owner: string;
      repo: string;
      head: string;
      state: 'open';
      per_page?: number;
    }) => Promise<{ data: Array<{ number: number; html_url?: string }> }>;
    create: (params: {
      owner: string;
      repo: string;
      head: string;
      base: string;
      title: string;
      body: string;
      draft?: boolean;
      maintainer_can_modify?: boolean;
    }) => Promise<{ data: { number: number; html_url?: string } }>;
    update: (params: {
      owner: string;
      repo: string;
      pull_number: number;
      title: string;
      body: string;
      maintainer_can_modify?: boolean;
    }) => Promise<{ data: { number: number; html_url?: string } }>;
  };
}

export interface PullRequestOptions {
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body: string;
  authToken: string;
  draft?: boolean;
  maintainerCanModify?: boolean;
  client?: OctokitClient;
}

export interface PullRequestResult {
  action: 'created' | 'updated';
  number: number;
  url: string | undefined;
}

const USER_AGENT = 'python-version-patch-pr/0.1.0';

function createClient(authToken: string): OctokitClient {
  return new Octokit({ auth: authToken, userAgent: USER_AGENT });
}

export async function createOrUpdatePullRequest(
  options: PullRequestOptions,
): Promise<PullRequestResult> {
  const { owner, repo, head, base, title, body, authToken, draft, maintainerCanModify, client } =
    options;

  const octokit = client ?? createClient(authToken);

  const { data: existing } = await octokit.pulls.list({
    owner,
    repo,
    head: `${owner}:${head}`,
    state: 'open',
    per_page: 1,
  });

  if (existing.length > 0) {
    const pull = existing[0];
    const response = await octokit.pulls.update({
      owner,
      repo,
      pull_number: pull.number,
      title,
      body,
      maintainer_can_modify: maintainerCanModify,
    });

    return { action: 'updated', number: response.data.number, url: response.data.html_url };
  }

  const response = await octokit.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
    draft,
    maintainer_can_modify: maintainerCanModify,
  });

  return { action: 'created', number: response.data.number, url: response.data.html_url };
}
