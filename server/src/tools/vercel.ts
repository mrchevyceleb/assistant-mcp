import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

async function vercelRequest(endpoint: string, method: string = 'GET', body?: any) {
  const token = await getCredential('vercel');

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`https://api.vercel.com${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    logger.error('Vercel API error:', error);
    throw new Error(`Vercel API error: ${response.statusText}`);
  }

  return response.json();
}

export const vercelTools = {
  deploy_site: {
    description: 'Deploy a site to Vercel (creates project if needed)',
    inputSchema: z.object({
      project_name: z.string().min(1),
      files: z.record(z.string()).describe('File paths as keys, content as values'),
      build_command: z.string().optional(),
      output_directory: z.string().optional().default('public'),
      framework: z.string().optional(),
    }),
    handler: async ({ project_name, files, build_command, output_directory = 'public', framework }: any) => {
      // Convert files object to Vercel format
      const filesList = Object.entries(files).map(([file, content]) => ({
        file,
        data: Buffer.from(content as string).toString('base64'),
      }));

      const deployment = await vercelRequest('/v13/deployments', 'POST', {
        name: project_name,
        files: filesList,
        projectSettings: {
          buildCommand: build_command,
          outputDirectory: output_directory,
          framework: framework,
        },
      });

      return {
        deployment_id: deployment.id,
        url: deployment.url,
        ready_url: `https://${deployment.url}`,
        status: deployment.readyState,
      };
    },
  },

  list_deployments: {
    description: 'List recent deployments for a project',
    inputSchema: z.object({
      project_name: z.string().optional(),
      limit: z.number().optional().default(20).min(1).max(100),
    }),
    handler: async ({ project_name, limit = 20 }: { project_name?: string; limit?: number }) => {
      const endpoint = project_name
        ? `/v6/deployments?projectId=${project_name}&limit=${limit}`
        : `/v6/deployments?limit=${limit}`;

      const data = await vercelRequest(endpoint);

      return {
        deployments: data.deployments.map((d: any) => ({
          id: d.uid,
          name: d.name,
          url: d.url,
          state: d.state,
          created_at: d.created,
        })),
        count: data.deployments.length,
      };
    },
  },

  get_deployment_url: {
    description: 'Get the URL for a specific deployment',
    inputSchema: z.object({
      deployment_id: z.string(),
    }),
    handler: async ({ deployment_id }: { deployment_id: string }) => {
      const data = await vercelRequest(`/v13/deployments/${deployment_id}`);

      return {
        deployment_id: data.id,
        url: data.url,
        ready_url: `https://${data.url}`,
        status: data.readyState,
        created_at: data.created,
      };
    },
  },
};

// Register Vercel tools
registerTool('deploy_site', 'deploy', vercelTools.deploy_site.description, vercelTools.deploy_site.inputSchema);
registerTool('list_deployments', 'deploy', vercelTools.list_deployments.description, vercelTools.list_deployments.inputSchema);
registerTool('get_deployment_url', 'deploy', vercelTools.get_deployment_url.description, vercelTools.get_deployment_url.inputSchema);
