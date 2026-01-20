import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { registerTool } from './meta.js';
import { logger } from '../lib/logger.js';

const CategoryEnum = z.enum(['decision', 'preference', 'context', 'client', 'workflow', 'other']);

export const memoryTools = {
  save_memory: {
    description: 'Save a new memory (decision, context, preference, client info, etc.)',
    inputSchema: z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1),
      project: z.string().optional(),
      category: CategoryEnum.optional(),
      tags: z.array(z.string()).optional().default([]),
    }),
    handler: async (params: any) => {
      const { data, error } = await supabase
        .from('memory')
        .insert({
          title: params.title,
          content: params.content,
          project: params.project,
          category: params.category,
          tags: params.tags || [],
        })
        .select()
        .single();

      if (error) {
        logger.error('save_memory error:', error);
        throw error;
      }

      return { memory: data, message: 'Memory saved successfully' };
    },
  },

  search_memory: {
    description: 'Search memories by keyword, category, project, or tags (full-text search)',
    inputSchema: z.object({
      query: z.string().optional().describe('Text to search in title and content'),
      project: z.string().optional(),
      category: CategoryEnum.optional(),
      tags: z.array(z.string()).optional(),
      limit: z.number().optional().default(20),
    }),
    handler: async (params: any) => {
      let query = supabase.from('memory').select('*').order('created_at', { ascending: false });

      if (params.project) {
        query = query.eq('project', params.project);
      }

      if (params.category) {
        query = query.eq('category', params.category);
      }

      if (params.tags && params.tags.length > 0) {
        query = query.contains('tags', params.tags);
      }

      if (params.query) {
        // Full-text search on title and content
        query = query.or(`title.ilike.%${params.query}%,content.ilike.%${params.query}%`);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('search_memory error:', error);
        throw error;
      }

      return {
        memories: data,
        count: data?.length || 0,
      };
    },
  },

  recent_memories: {
    description: 'Get most recent memories (last 30 days)',
    inputSchema: z.object({
      days: z.number().optional().default(30),
      limit: z.number().optional().default(20),
    }),
    handler: async ({ days = 30, limit = 20 }: { days?: number; limit?: number }) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from('memory')
        .select('*')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('recent_memories error:', error);
        throw error;
      }

      return {
        memories: data,
        count: data?.length || 0,
        period: `${days} days`,
      };
    },
  },

  delete_memory: {
    description: 'Delete a memory by ID',
    inputSchema: z.object({
      id: z.string().uuid(),
    }),
    handler: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('memory').delete().eq('id', id);

      if (error) {
        logger.error('delete_memory error:', error);
        throw error;
      }

      return { message: 'Memory deleted successfully' };
    },
  },
};

// Register memory tools
registerTool('save_memory', 'memory', memoryTools.save_memory.description, memoryTools.save_memory.inputSchema, [
  'save_memory({ title: "Matt prefers concise responses", content: "...", category: "preference" })',
]);
registerTool('search_memory', 'memory', memoryTools.search_memory.description, memoryTools.search_memory.inputSchema, [
  'search_memory({ query: "Kim Garst", category: "client" })',
]);
registerTool('recent_memories', 'memory', memoryTools.recent_memories.description, memoryTools.recent_memories.inputSchema);
registerTool('delete_memory', 'memory', memoryTools.delete_memory.description, memoryTools.delete_memory.inputSchema);
