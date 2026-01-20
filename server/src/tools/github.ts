import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

async function githubRequest(endpoint: string, method: string = 'GET', body?: any) {
  const token = await getCredential('github');

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`https://api.github.com${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    logger.error('GitHub API error:', error);
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return response.json();
}

export const githubTools = {
  create_issue: {
    description: 'Create a GitHub issue in a repository',
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string().min(1),
      body: z.string().optional(),
      labels: z.array(z.string()).optional(),
      assignees: z.array(z.string()).optional(),
    }),
    handler: async ({ owner, repo, title, body, labels, assignees }: any) => {
      const data = await githubRequest(`/repos/${owner}/${repo}/issues`, 'POST', {
        title,
        body,
        labels,
        assignees,
      }) as any;

      return {
        issue_number: data.number,
        url: data.html_url,
        state: data.state,
      };
    },
  },

  create_pr: {
    description: 'Create a pull request in a repository',
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string().min(1),
      head: z.string().describe('Branch name containing changes'),
      base: z.string().describe('Branch name to merge into (e.g., "main")'),
      body: z.string().optional(),
      draft: z.boolean().optional().default(false),
    }),
    handler: async ({ owner, repo, title, head, base, body, draft }: any) => {
      const data = await githubRequest(`/repos/${owner}/${repo}/pulls`, 'POST', {
        title,
        head,
        base,
        body,
        draft,
      }) as any;

      return {
        pr_number: data.number,
        url: data.html_url,
        state: data.state,
      };
    },
  },

  search_code: {
    description: 'Search for code in GitHub repositories',
    inputSchema: z.object({
      query: z.string().min(1),
      owner: z.string().optional(),
      repo: z.string().optional(),
      language: z.string().optional(),
      limit: z.number().min(1).max(100).optional().default(10),
    }),
    handler: async ({ query, owner, repo, language, limit = 10 }: any) => {
      let searchQuery = query;

      if (owner && repo) {
        searchQuery += ` repo:${owner}/${repo}`;
      } else if (owner) {
        searchQuery += ` user:${owner}`;
      }

      if (language) {
        searchQuery += ` language:${language}`;
      }

      const data = await githubRequest(
        `/search/code?q=${encodeURIComponent(searchQuery)}&per_page=${limit}`
      ) as any;

      return {
        total_count: data.total_count,
        items: data.items || [],
        query: searchQuery,
      };
    },
  },

  list_repos: {
    description: 'List repositories for a user or organization',
    inputSchema: z.object({
      owner: z.string().optional().describe('Username or org name (defaults to authenticated user)'),
      type: z.enum(['all', 'owner', 'member']).optional().default('all'),
      sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().default('updated'),
      limit: z.number().min(1).max(100).optional().default(30),
    }),
    handler: async ({ owner, type = 'all', sort = 'updated', limit = 30 }: any) => {
      const endpoint = owner
        ? `/users/${owner}/repos?type=${type}&sort=${sort}&per_page=${limit}`
        : `/user/repos?type=${type}&sort=${sort}&per_page=${limit}`;

      const data = await githubRequest(endpoint) as any[];

      return {
        repositories: data.map((repo: any) => ({
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          private: repo.private,
          updated_at: repo.updated_at,
        })),
        count: data.length,
      };
    },
  },
};

// Register GitHub tools
registerTool('create_issue', 'github', githubTools.create_issue.description, githubTools.create_issue.inputSchema);
registerTool('create_pr', 'github', githubTools.create_pr.description, githubTools.create_pr.inputSchema);
registerTool('search_code', 'github', githubTools.search_code.description, githubTools.search_code.inputSchema);
registerTool('list_repos', 'github', githubTools.list_repos.description, githubTools.list_repos.inputSchema);
