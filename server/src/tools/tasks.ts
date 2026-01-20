import { z } from 'zod';
import { supabase, Task } from '../lib/supabase.js';
import { registerTool } from './meta.js';
import { logger } from '../lib/logger.js';

const ProjectEnum = z.enum(['EliteTeam', 'KG-KimGarst', 'YourProfitPartners', 'MattJohnston-io', 'Personal']);
const StatusEnum = z.enum(['not_started', 'in_progress', 'completed', 'blocked', 'cancelled']);
const PriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

export const taskTools = {
  list_tasks: {
    description: 'List tasks with optional filters (project, status, due date range)',
    inputSchema: z.object({
      project: ProjectEnum.optional(),
      status: StatusEnum.optional(),
      priority: PriorityEnum.optional(),
      due_before: z.string().optional().describe('ISO date string (YYYY-MM-DD)'),
      due_after: z.string().optional().describe('ISO date string (YYYY-MM-DD)'),
      limit: z.number().optional().default(50),
    }),
    handler: async (params: any) => {
      let query = supabase.from('tasks').select('*').order('due_date', { ascending: true });

      if (params.project) query = query.eq('project', params.project);
      if (params.status) query = query.eq('status', params.status);
      if (params.priority) query = query.eq('priority', params.priority);
      if (params.due_before) query = query.lte('due_date', params.due_before);
      if (params.due_after) query = query.gte('due_date', params.due_after);
      if (params.limit) query = query.limit(params.limit);

      const { data, error } = await query;

      if (error) {
        logger.error('list_tasks error:', error);
        throw error;
      }

      return { tasks: data, count: data?.length || 0 };
    },
  },

  get_task: {
    description: 'Get a specific task by ID',
    inputSchema: z.object({
      id: z.string().uuid(),
    }),
    handler: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('get_task error:', error);
        throw error;
      }

      return { task: data };
    },
  },

  create_task: {
    description: 'Create a new task',
    inputSchema: z.object({
      project: ProjectEnum,
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Format: YYYY-MM-DD'),
      priority: PriorityEnum.optional().default('medium'),
      checklist: z.array(z.object({
        text: z.string(),
        completed: z.boolean().default(false),
      })).optional().default([]),
      notes: z.string().optional(),
    }),
    handler: async (params: any) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project: params.project,
          title: params.title,
          description: params.description,
          due_date: params.due_date,
          priority: params.priority || 'medium',
          checklist: params.checklist || [],
          notes: params.notes,
          status: 'not_started',
        })
        .select()
        .single();

      if (error) {
        logger.error('create_task error:', error);
        throw error;
      }

      return { task: data, message: 'Task created successfully' };
    },
  },

  update_task: {
    description: 'Update an existing task',
    inputSchema: z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: StatusEnum.optional(),
      priority: PriorityEnum.optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      checklist: z.array(z.object({
        text: z.string(),
        completed: z.boolean(),
      })).optional(),
      notes: z.string().optional(),
    }),
    handler: async ({ id, ...updates }: any) => {
      // If status is being set to completed, set completed_at
      if (updates.status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('update_task error:', error);
        throw error;
      }

      return { task: data, message: 'Task updated successfully' };
    },
  },

  complete_task: {
    description: 'Mark a task as completed',
    inputSchema: z.object({
      id: z.string().uuid(),
    }),
    handler: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('complete_task error:', error);
        throw error;
      }

      return { task: data, message: 'Task completed' };
    },
  },

  delete_task: {
    description: 'Delete a task (soft delete - sets status to cancelled)',
    inputSchema: z.object({
      id: z.string().uuid(),
      hard_delete: z.boolean().optional().default(false).describe('Permanently delete instead of cancel'),
    }),
    handler: async ({ id, hard_delete }: { id: string; hard_delete?: boolean }) => {
      if (hard_delete) {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) {
          logger.error('delete_task error:', error);
          throw error;
        }
        return { message: 'Task permanently deleted' };
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .update({ status: 'cancelled' })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          logger.error('delete_task error:', error);
          throw error;
        }

        return { task: data, message: 'Task cancelled' };
      }
    },
  },

  urgent_tasks: {
    description: 'Get tasks due today or overdue, sorted by priority',
    inputSchema: z.object({
      include_tomorrow: z.boolean().optional().default(false),
    }),
    handler: async ({ include_tomorrow }: { include_tomorrow?: boolean }) => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      let query = supabase
        .from('tasks')
        .select('*')
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .lte('due_date', include_tomorrow ? tomorrow : today)
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true });

      const { data, error } = await query;

      if (error) {
        logger.error('urgent_tasks error:', error);
        throw error;
      }

      const today_date = new Date(today);
      const overdue = data?.filter(t => new Date(t.due_date) < today_date) || [];
      const due_today = data?.filter(t => t.due_date === today) || [];
      const due_tomorrow = include_tomorrow
        ? data?.filter(t => t.due_date === tomorrow) || []
        : [];

      return {
        overdue,
        due_today,
        due_tomorrow,
        total: data?.length || 0,
      };
    },
  },

  process_inbox: {
    description: 'Get unprocessed inbox items and optionally convert them to tasks',
    inputSchema: z.object({
      convert_to_tasks: z.boolean().optional().default(false),
      limit: z.number().optional().default(20),
    }),
    handler: async ({ convert_to_tasks, limit }: { convert_to_tasks?: boolean; limit?: number }) => {
      const { data: items, error } = await supabase
        .from('inbox')
        .select('*')
        .eq('processed', false)
        .order('created_at', { ascending: false })
        .limit(limit || 20);

      if (error) {
        logger.error('process_inbox error:', error);
        throw error;
      }

      if (convert_to_tasks && items && items.length > 0) {
        const taskItems = items.filter(i => i.item_type === 'task');
        const converted = [];

        for (const item of taskItems) {
          // This is a simplified conversion - in practice, you'd need more context
          // to extract project, due_date, etc. from the inbox item
          const message = 'Inbox items flagged as tasks need manual review for project/due_date assignment';
          converted.push({ item_id: item.id, message });
        }

        return { inbox_items: items, conversion_note: converted };
      }

      return { inbox_items: items, count: items?.length || 0 };
    },
  },
};

// Register all task tools
registerTool('list_tasks', 'tasks', taskTools.list_tasks.description, taskTools.list_tasks.inputSchema, [
  'list_tasks({ project: "EliteTeam", status: "in_progress" })',
  'list_tasks({ due_before: "2026-01-31" })',
]);
registerTool('get_task', 'tasks', taskTools.get_task.description, taskTools.get_task.inputSchema);
registerTool('create_task', 'tasks', taskTools.create_task.description, taskTools.create_task.inputSchema);
registerTool('update_task', 'tasks', taskTools.update_task.description, taskTools.update_task.inputSchema);
registerTool('complete_task', 'tasks', taskTools.complete_task.description, taskTools.complete_task.inputSchema);
registerTool('delete_task', 'tasks', taskTools.delete_task.description, taskTools.delete_task.inputSchema);
registerTool('urgent_tasks', 'tasks', taskTools.urgent_tasks.description, taskTools.urgent_tasks.inputSchema);
registerTool('process_inbox', 'tasks', taskTools.process_inbox.description, taskTools.process_inbox.inputSchema);
