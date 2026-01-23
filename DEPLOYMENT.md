# Deployment Guide

This guide covers deploying assistant-mcp for use with Claude Code.

## Local Development (Default)

The MCP runs locally via stdio when Claude Code starts. This is the default and recommended setup.

### Prerequisites

- Node.js 20+
- npm
- Supabase project (for database)
- API keys for services you want to use

### Setup Steps

#### 1. Install Dependencies

```bash
cd assistant-mcp/server
npm install
```

#### 2. Configure .mcp.json

Edit the project's `.mcp.json` file:

```json
{
  "mcpServers": {
    "assistant-mcp": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "./assistant-mcp/server",
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_KEY": "your-service-role-key",
        "ENCRYPTION_KEY": "your-32-byte-hex-key",
        "MCP_AUTH_TOKEN": "mcp_live_your-random-token",
        "NODE_ENV": "production",
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/gcp-oauth.keys.json"
      }
    }
  }
}
```

Generate keys:
```bash
# Encryption key (32 bytes hex)
openssl rand -hex 32

# Auth token
echo "mcp_live_$(openssl rand -hex 32)"
```

#### 3. Enable in Claude Code

Edit `~/.claude.json`:

```json
{
  "projects": {
    "/path/to/your/project": {
      "enabledMcpjsonServers": ["assistant-mcp"],
      "hasTrustDialogAccepted": true
    }
  }
}
```

#### 4. Setup Supabase Tables

Run this SQL in your Supabase SQL Editor:

```sql
-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'not_started',
  priority TEXT DEFAULT 'medium',
  project TEXT,
  due_date DATE,
  notes TEXT,
  checklist JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Memory
CREATE TABLE IF NOT EXISTS memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  project TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credentials (encrypted)
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL UNIQUE,
  encrypted_data TEXT NOT NULL,
  iv TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  account TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service, account)
);

-- Tool usage analytics
CREATE TABLE IF NOT EXISTS tool_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  category TEXT,
  success BOOLEAN DEFAULT TRUE,
  execution_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
CREATE INDEX IF NOT EXISTS idx_tool_usage_created ON tool_usage(created_at);
```

#### 5. Store API Credentials

Create a script or run in Node REPL:

```typescript
import { storeCredential } from './src/lib/encryption.js';

// Store each credential
await storeCredential('brave_search', 'your-brave-api-key');
await storeCredential('perplexity', 'your-perplexity-key');
await storeCredential('gemini', 'your-gemini-key');
await storeCredential('github', 'ghp_your-github-token');
await storeCredential('vercel', 'your-vercel-token');
await storeCredential('hubspot', 'your-hubspot-key');
await storeCredential('monday', 'your-monday-token');
await storeCredential('n8n', 'your-n8n-key');
```

#### 6. Start Claude Code

```bash
claude
```

The MCP starts automatically. Verify with:
```
/mcp
```

#### 7. Test Tools

```
server_status
list_capabilities
```

---

## Multi-Computer Setup

The assistant-mcp folder syncs via OneDrive across computers.

### What Syncs Automatically
- All source code
- `.mcp.json` configuration
- Documentation

### Per-Machine Setup Required

1. **Install dependencies:**
   ```bash
   cd assistant-mcp/server
   npm install
   ```

2. **Enable in `~/.claude.json`:**
   Add `"assistant-mcp"` to `enabledMcpjsonServers` array

3. **OAuth setup (Calendar):**
   Run the OAuth flow once per machine for Google Calendar

---

## Remote Deployment (Optional)

For a centralized server that all computers connect to:

### Railway Deployment

1. Push code to GitHub
2. Create new project on Railway
3. Connect to your repo
4. Set environment variables in Railway dashboard
5. Update `.mcp.json` to use HTTP transport instead of stdio

This is more complex and not recommended unless you have specific needs.

---

## Troubleshooting

### MCP not loading

1. Check `.mcp.json` is valid JSON
2. Verify `enabledMcpjsonServers` includes `"assistant-mcp"`
3. Check Node.js version: `node --version` (need 20+)
4. Look for errors: `npm run build` in server directory

### Tools not working

1. Run `server_status` to check health
2. Verify credentials are stored
3. Check Supabase connection

### Code changes not taking effect

1. Restart Claude Code completely
2. The tsx runtime should pick up changes automatically
3. If still broken, check for TypeScript errors: `npm run build`

### Port conflicts

The HTTP admin server uses port 9001. If that's in use:
- Another instance might be running
- Kill it: `pkill -f "tsx src/index.ts"`
- Or change `BASE_PORT` in `src/index.ts`
