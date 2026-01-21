import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from server directory
config({ path: resolve(__dirname, '../../../server/.env') });

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
    }

    supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabase;
}

export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('Missing ENCRYPTION_KEY in environment');
  }
  return key;
}

export function getAuthToken(): string {
  const token = process.env.MCP_AUTH_TOKEN;
  if (!token) {
    throw new Error('Missing MCP_AUTH_TOKEN in environment');
  }
  return token;
}

export function getServerUrl(): string {
  const port = process.env.PORT || '9001';
  return `http://localhost:${port}`;
}
