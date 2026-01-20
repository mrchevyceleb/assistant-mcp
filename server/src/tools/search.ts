import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

export const searchTools = {
  web_search: {
    description: 'Search the web using Brave Search API',
    inputSchema: z.object({
      query: z.string().min(1).max(400),
      count: z.number().min(1).max(20).optional().default(10),
    }),
    handler: async ({ query, count = 10 }: { query: string; count?: number }) => {
      const apiKey = await getCredential('brave_search');

      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
        {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        query,
        results: data.web?.results || [],
        total: data.web?.results?.length || 0,
      };
    },
  },

  deep_research: {
    description: 'Conduct in-depth research using Perplexity Sonar Deep Research',
    inputSchema: z.object({
      query: z.string().min(1),
      focus_areas: z.array(z.string()).optional(),
    }),
    handler: async ({ query, focus_areas }: { query: string; focus_areas?: string[] }) => {
      const apiKey = await getCredential('perplexity');

      const payload: any = {
        model: 'sonar-deep-research',
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      };

      if (focus_areas && focus_areas.length > 0) {
        payload.messages[0].content += '\n\nFocus areas: ' + focus_areas.join(', ');
      }

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        query,
        answer: data.choices[0]?.message?.content || '',
        citations: data.citations || [],
      };
    },
  },

  quick_search: {
    description: 'Quick search for simple queries using Perplexity Sonar Pro',
    inputSchema: z.object({
      query: z.string().min(1),
    }),
    handler: async ({ query }: { query: string }) => {
      const apiKey = await getCredential('perplexity');

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            {
              role: 'user',
              content: query,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        query,
        answer: data.choices[0]?.message?.content || '',
      };
    },
  },
};

// Register search tools
registerTool('web_search', 'search', searchTools.web_search.description, searchTools.web_search.inputSchema);
registerTool('deep_research', 'search', searchTools.deep_research.description, searchTools.deep_research.inputSchema);
registerTool('quick_search', 'search', searchTools.quick_search.description, searchTools.quick_search.inputSchema);
