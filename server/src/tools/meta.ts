import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

// Tool registry for self-documentation
export const toolRegistry: Record<string, {
  category: string;
  description: string;
  inputSchema: z.ZodSchema;
  examples?: string[];
}> = {};

export function registerTool(
  name: string,
  category: string,
  description: string,
  inputSchema: z.ZodSchema,
  examples?: string[]
) {
  toolRegistry[name] = { category, description, inputSchema, examples };
}

// Meta tools
export const metaTools = {
  help: {
    description: 'Get detailed help for a specific tool or category',
    inputSchema: z.object({
      query: z.string().optional().describe('Tool name or category to get help for'),
    }),
    handler: async ({ query }: { query?: string }) => {
      if (!query) {
        // Return categories
        const categories = new Set(Object.values(toolRegistry).map(t => t.category));
        return {
          message: 'Available categories',
          categories: Array.from(categories),
          hint: 'Call help with a category or tool name for detailed information',
        };
      }

      // Check if it's a specific tool
      if (toolRegistry[query]) {
        const tool = toolRegistry[query];
        return {
          tool: query,
          category: tool.category,
          description: tool.description,
          inputSchema: tool.inputSchema.describe,
          examples: tool.examples || [],
        };
      }

      // Check if it's a category
      const categoryTools = Object.entries(toolRegistry)
        .filter(([_, tool]) => tool.category.toLowerCase() === query.toLowerCase())
        .map(([name, tool]) => ({
          name,
          description: tool.description,
        }));

      if (categoryTools.length > 0) {
        return {
          category: query,
          tools: categoryTools,
        };
      }

      return { error: `No tool or category found for: ${query}` };
    },
  },

  list_capabilities: {
    description: 'Returns categorized list of all available tools',
    inputSchema: z.object({}),
    handler: async () => {
      const categories: Record<string, Array<{ name: string; description: string }>> = {};

      for (const [name, tool] of Object.entries(toolRegistry)) {
        if (!categories[tool.category]) {
          categories[tool.category] = [];
        }
        categories[tool.category].push({
          name,
          description: tool.description,
        });
      }

      return {
        total_tools: Object.keys(toolRegistry).length,
        categories,
      };
    },
  },

  server_status: {
    description: 'Check server health, connected APIs, OAuth status, recent errors',
    inputSchema: z.object({}),
    handler: async () => {
      const status: any = {
        server: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        apis: {},
      };

      // Check Supabase connection
      try {
        const { error } = await supabase.from('server_health').select('*').limit(1);
        status.apis.supabase = error ? 'error' : 'connected';
      } catch (e) {
        status.apis.supabase = 'error';
      }

      // Check credentials in vault
      try {
        const { data: creds } = await supabase.from('credentials').select('service');
        status.credentials_stored = creds?.map(c => c.service) || [];
      } catch (e) {
        status.credentials_stored = [];
      }

      // Check OAuth tokens
      try {
        const { data: tokens } = await supabase.from('oauth_tokens').select('provider, expires_at');
        status.oauth_tokens = tokens?.map(t => ({
          provider: t.provider,
          status: t.expires_at && new Date(t.expires_at) > new Date() ? 'valid' : 'expired',
        })) || [];
      } catch (e) {
        status.oauth_tokens = [];
      }

      // Recent errors
      try {
        const { data: errors } = await supabase
          .from('tool_usage')
          .select('tool_name, error_message, created_at')
          .eq('success', false)
          .order('created_at', { ascending: false })
          .limit(5);
        status.recent_errors = errors || [];
      } catch (e) {
        status.recent_errors = [];
      }

      return status;
    },
  },

  tool_usage_stats: {
    description: 'See which tools are used most (last 30 days)',
    inputSchema: z.object({
      limit: z.number().optional().default(20).describe('Number of tools to return'),
    }),
    handler: async ({ limit = 20 }: { limit?: number }) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('tool_usage')
        .select('tool_name, category, success, execution_time_ms')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error || !data) {
        return { error: 'Failed to fetch tool usage stats' };
      }

      // Aggregate stats
      const stats: Record<string, {
        total_calls: number;
        successful: number;
        failed: number;
        avg_execution_ms: number;
        category: string;
      }> = {};

      for (const row of data) {
        if (!stats[row.tool_name]) {
          stats[row.tool_name] = {
            total_calls: 0,
            successful: 0,
            failed: 0,
            avg_execution_ms: 0,
            category: row.category,
          };
        }

        stats[row.tool_name].total_calls++;
        if (row.success) {
          stats[row.tool_name].successful++;
        } else {
          stats[row.tool_name].failed++;
        }
        stats[row.tool_name].avg_execution_ms += row.execution_time_ms || 0;
      }

      // Calculate averages and sort by usage
      const sorted = Object.entries(stats)
        .map(([name, s]) => ({
          tool: name,
          category: s.category,
          total_calls: s.total_calls,
          success_rate: ((s.successful / s.total_calls) * 100).toFixed(1) + '%',
          avg_execution_ms: Math.round(s.avg_execution_ms / s.total_calls),
        }))
        .sort((a, b) => b.total_calls - a.total_calls)
        .slice(0, limit);

      return {
        period: '30 days',
        top_tools: sorted,
      };
    },
  },
};

// Register meta tools
registerTool('help', 'meta', metaTools.help.description, metaTools.help.inputSchema, [
  'help("tasks")',
  'help("create_task")',
]);
registerTool('list_capabilities', 'meta', metaTools.list_capabilities.description, metaTools.list_capabilities.inputSchema);
registerTool('server_status', 'meta', metaTools.server_status.description, metaTools.server_status.inputSchema);
registerTool('tool_usage_stats', 'meta', metaTools.tool_usage_stats.description, metaTools.tool_usage_stats.inputSchema);
