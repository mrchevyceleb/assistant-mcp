-- Matt's Remote MCP Server - Database Schema
-- Created: January 20, 2026

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tasks table (replaces /01-Active/tasks/*.md)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL CHECK (project IN ('EliteTeam', 'KG-KimGarst', 'YourProfitPartners', 'MattJohnston-io', 'Personal')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE NOT NULL,
  checklist JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Indexes for common queries
  INDEX idx_tasks_project ON tasks(project),
  INDEX idx_tasks_due_date ON tasks(due_date),
  INDEX idx_tasks_status ON tasks(status),
  INDEX idx_tasks_priority ON tasks(priority)
);

-- Memory table (replaces memory-bank MCP)
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT CHECK (category IN ('decision', 'preference', 'context', 'client', 'workflow', 'other')),
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Full text search index
  INDEX idx_memory_title ON memory USING gin(to_tsvector('english', title)),
  INDEX idx_memory_content ON memory USING gin(to_tsvector('english', content)),
  INDEX idx_memory_category ON memory(category),
  INDEX idx_memory_tags ON memory USING gin(tags)
);

-- OAuth tokens (centralized, encrypted)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL UNIQUE, -- 'gmail_matt_mattjohnston_io', 'calendar', etc.
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_oauth_provider ON oauth_tokens(provider)
);

-- Credentials vault (API keys, encrypted)
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL UNIQUE, -- 'brave_search', 'perplexity', 'gemini', etc.
  api_key_encrypted TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- For any service-specific config
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_credentials_service ON credentials(service)
);

-- Inbox table (replaces /00-Intake/inbox.md)
CREATE TABLE inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  item_type TEXT DEFAULT 'note' CHECK (item_type IN ('task', 'note', 'link', 'file', 'idea')),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_inbox_processed ON inbox(processed),
  INDEX idx_inbox_created ON inbox(created_at)
);

-- Tool usage stats (for meta tools)
CREATE TABLE tool_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_name TEXT NOT NULL,
  category TEXT NOT NULL,
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_tool_usage_name ON tool_usage(tool_name),
  INDEX idx_tool_usage_created ON tool_usage(created_at),
  INDEX idx_tool_usage_success ON tool_usage(success)
);

-- Server health logs
CREATE TABLE server_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  message TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_server_health_created ON server_health(created_at)
);

-- Auto-update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_updated_at BEFORE UPDATE ON memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Optional for future multi-tenancy
-- For now, server-side auth token will handle access control
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE memory ENABLE ROW LEVEL SECURITY;
-- etc.

-- Grant permissions (adjust based on your Supabase service role)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
