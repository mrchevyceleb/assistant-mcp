import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

export let supabase: SupabaseClient;

export function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  logger.info('Supabase client initialized');
}

// Type definitions for database tables
export interface Task {
  id: string;
  project: 'EliteTeam' | 'KG-KimGarst' | 'YourProfitPartners' | 'MattJohnston-io' | 'Personal';
  title: string;
  description?: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
  checklist: Array<{ text: string; completed: boolean }>;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Memory {
  id: string;
  project?: string;
  title: string;
  content: string;
  category?: 'decision' | 'preference' | 'context' | 'client' | 'workflow' | 'other';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Credential {
  id: string;
  service: string;
  api_key_encrypted: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OAuthToken {
  id: string;
  provider: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface InboxItem {
  id: string;
  content: string;
  item_type: 'task' | 'note' | 'link' | 'file' | 'idea';
  processed: boolean;
  processed_at?: string;
  created_at: string;
}

export interface ToolUsage {
  id: string;
  tool_name: string;
  category: string;
  execution_time_ms: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}
