# Matt's Remote MCP Server

Production-ready remote MCP server that consolidates 12+ MCPs into a single server with ~50 focused tools, plus CLI and Web Admin UI for management.

## Problem Solved

**Before:**
- 12+ MCPs across 4 computers
- 350+ tools bloating context window
- Config sync nightmare (`.mcp.json` syncs, `~/.claude.json` doesn't)
- Per-machine OAuth setup required
- MCPs constantly disappearing

**After:**
- 1 remote MCP server + Playwright local = 2 MCPs total
- ~50 focused tools
- Single OAuth setup (stored in Supabase)
- Works identically across all computers
- Database-backed tasks and memory
- CLI and Web UI for easy management

## Architecture

```
4 Computers ──► Stdio ──► MCP Server (Railway) ──► Supabase (State)
                              │
                              ├── Gmail API (5 accounts)
                              ├── Calendar API
                              ├── Brave/Perplexity
                              ├── Vercel API
                              ├── GitHub API
                              ├── Gemini API
                              └── HubSpot/GHL/n8n APIs

Management:
┌─────────────┐     ┌─────────────────┐
│   CLI Tool  │────►│  MCP Server API │◄────┌─────────────┐
└─────────────┘     └─────────────────┘     │ Web Admin UI│
                                             └─────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account (for database)
- Railway account (for hosting) OR run locally

### 1. Clone and Install

```bash
cd assistant-mcp

# Install server dependencies
cd server
npm install

# Install CLI dependencies
cd ../cli
npm install
npm run build

# Install Admin UI dependencies
cd ../admin-ui
npm install
```

### 2. Environment Variables

Create `server/.env`:

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Encryption (generate a random 32+ char string)
ENCRYPTION_KEY=your-secure-encryption-key-here

# Auth token for API access (generate a random string)
MCP_AUTH_TOKEN=mcp_live_your_token_here

# Optional: API keys for various services
BRAVE_API_KEY=your-brave-api-key
PERPLEXITY_API_KEY=your-perplexity-key
GITHUB_TOKEN=your-github-token
VERCEL_TOKEN=your-vercel-token
GEMINI_API_KEY=your-gemini-key
```

### 3. Database Setup

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tasks table (replaces markdown files)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  project TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  tags TEXT[],
  metadata JSONB DEFAULT '{}'
);

-- Memory table (replaces memory-bank MCP)
CREATE TABLE IF NOT EXISTS memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Encrypted credentials storage
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL UNIQUE,
  encrypted_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens (for Gmail, Calendar, etc.)
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

-- Inbox items (replaces inbox.md)
CREATE TABLE IF NOT EXISTS inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source TEXT,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Tool usage analytics
CREATE TABLE IF NOT EXISTS tool_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  category TEXT,
  success BOOLEAN DEFAULT TRUE,
  execution_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Server health logs
CREATE TABLE IF NOT EXISTS server_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  uptime_seconds NUMERIC,
  memory_usage JSONB,
  active_connections INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_name ON tool_usage(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_usage_created_at ON tool_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_processed ON inbox(processed);
```

### 4. Start the Server

```bash
cd server
npm run dev
# Server runs on http://localhost:9001
```

### 5. Access Admin UI

Open http://localhost:9001/admin in your browser.

Login with your `MCP_AUTH_TOKEN` from the `.env` file.

---

## CLI Tool

The CLI provides command-line management of credentials, server status, tools, and MCP configuration.

### Installation

```bash
cd cli
npm install
npm run build
npm link  # Makes 'mcp' command available globally
```

### Commands

#### Credentials Management

```bash
# Store a new credential (encrypted)
mcp secret set openai sk-your-api-key-here

# List all stored credentials
mcp secret list

# Get a credential (shows masked value)
mcp secret get openai

# Delete a credential
mcp secret delete openai
```

#### Server Status

```bash
# Check server health
mcp status

# Verbose output with details
mcp status -v
```

#### Tools

```bash
# List all tools
mcp tools

# Filter by category
mcp tools --category search

# Test a specific tool
mcp tools --test help

# Output as JSON
mcp tools --json
```

#### MCP Configuration

```bash
# List all configured MCPs
mcp config list

# Add a new MCP to .mcp.json
mcp config add github

# Remove an MCP from .mcp.json
mcp config remove github

# Enable an MCP on this machine (~/.claude.json)
mcp config enable github

# Disable an MCP on this machine
mcp config disable github
```

### CLI Environment

The CLI uses the same environment variables. Create `cli/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
ENCRYPTION_KEY=your-secure-encryption-key-here
MCP_AUTH_TOKEN=mcp_live_your_token_here
MCP_SERVER_URL=http://localhost:9001
```

---

## Web Admin UI

A React-based admin interface for managing the MCP server.

### Features

- **Dashboard**: Server health, uptime, tool statistics, recent activity
- **Credentials**: Add, delete, and test API credentials
- **Tools**: Browse tools by category, search, and test individual tools

### Development

```bash
cd admin-ui
npm install
npm run dev
# Opens on http://localhost:5173
# Proxies API requests to http://localhost:9001
```

### Production Build

```bash
cd admin-ui
npm run build
# Outputs to server/public/admin/
```

The built files are served by the Express server at `/admin`.

### Tech Stack

- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS v4 for styling
- React Query for server state
- React Router for navigation
- Lucide React for icons

---

## API Endpoints

All endpoints require `Authorization: Bearer <MCP_AUTH_TOKEN>` header.

### Health & Status

```
GET /health              # Basic health check (no auth)
GET /admin/api/dashboard # Dashboard data with stats
```

### Credentials

```
GET    /admin/api/credentials           # List all credentials
POST   /admin/api/credentials           # Store new credential
       Body: { "service": "openai", "apiKey": "sk-..." }
DELETE /admin/api/credentials/:service  # Delete credential
POST   /admin/api/credentials/:service/test  # Test credential validity
```

### Tools

```
GET  /admin/api/tools           # List all tools grouped by category
GET  /tools                     # List tools (MCP format)
POST /admin/api/tools/:name/test # Test a tool with empty args
POST /tools/call                # Call a tool
     Body: { "name": "help", "arguments": {} }
```

### Statistics

```
GET /admin/api/stats/usage  # Tool usage statistics
```

---

## Multi-Computer Setup

This setup syncs via OneDrive while allowing per-machine configuration.

### Files That Sync (OneDrive)

- `assistant-mcp/.mcp.json` - Project-level MCP definitions
- `assistant-mcp/server/` - All server code
- `assistant-mcp/cli/` - All CLI code
- `assistant-mcp/admin-ui/` - All UI code

### Per-Machine Setup Required

1. **Install dependencies on each machine:**
   ```bash
   cd assistant-mcp/server && npm install
   cd ../cli && npm install && npm run build && npm link
   cd ../admin-ui && npm install
   ```

2. **Create `.env` files** (these don't sync for security):
   - `server/.env`
   - `cli/.env`

3. **Enable MCP in `~/.claude.json`:**
   ```json
   {
     "projects": {
       "C:/Users/yourname/path/to/Assistant": {
         "enabledMcpjsonServers": ["assistant-mcp"],
         "hasTrustDialogAccepted": true
       }
     }
   }
   ```

### Remote Deployment (Railway)

For true cross-computer access without running locally:

1. Deploy server to Railway
2. Set environment variables in Railway dashboard
3. Update `.mcp.json` to point to Railway URL:
   ```json
   {
     "mcpServers": {
       "matt": {
         "command": "npx",
         "args": ["-y", "@mattjohnston/assistant-mcp-client"],
         "env": {
           "MCP_SERVER_URL": "https://your-app.up.railway.app",
           "MCP_AUTH_TOKEN": "your-token"
         }
       }
     }
   }
   ```

---

## Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **Meta** | 4 | help, list_capabilities, server_status, tool_usage_stats |
| **Tasks** | 8 | list, get, create, update, complete, delete, urgent, process_inbox |
| **Memory** | 4 | save, search, recent, delete |
| **Search** | 3 | web_search, deep_research, quick_search |
| **Images** | 2 | generate_image, edit_image |
| **GitHub** | 4 | create_issue, create_pr, search_code, list_repos |
| **Deploy** | 3 | deploy_site, list_deployments, get_deployment_url |
| **Email** | 6 | Coming soon (OAuth) |
| **Calendar** | 4 | Coming soon (OAuth) |
| **CRM** | 8 | Coming soon (HubSpot + GHL) |

---

## Security

- API keys encrypted with AES-256-GCM
- Separate encryption salt per credential
- Auth token required for all API requests
- OAuth tokens stored encrypted
- No plaintext secrets in code or logs
- Admin UI requires authentication

---

## Troubleshooting

### CLI not finding server

```bash
# Check server is running
curl http://localhost:9001/health

# Check CLI environment
cat cli/.env
```

### Admin UI login fails

1. Ensure `MCP_AUTH_TOKEN` in `.env` matches what you enter
2. Check browser console for errors
3. Verify server is running: `curl http://localhost:9001/health`

### MCP not appearing in Claude Code

1. Check `.mcp.json` has correct syntax
2. Verify `~/.claude.json` has MCP enabled:
   ```json
   "enabledMcpjsonServers": ["assistant-mcp"]
   ```
3. Restart Claude Code after config changes

### Database connection errors

1. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
2. Check Supabase dashboard for any issues
3. Run migrations if tables don't exist

### Tailwind styles not working (Admin UI)

The project uses Tailwind CSS v4. Ensure:
- `@tailwindcss/postcss` is installed
- `postcss.config.js` uses `'@tailwindcss/postcss': {}`
- `index.css` uses `@import "tailwindcss"` (not old directives)

---

## Development

### Adding a New Tool

1. Create tool in `server/src/tools/category.ts`
2. Register with `registerTool(name, category, description, schema)`
3. Import in `server/src/index.ts`
4. Add to `allTools` object
5. Rebuild and redeploy

### Running Tests

```bash
# Server tests
cd server && npm test

# CLI tests
cd cli && npm test
```

### Project Structure

```
assistant-mcp/
├── server/              # Express MCP server
│   ├── src/
│   │   ├── index.ts     # Main entry point
│   │   ├── lib/         # Encryption, auth middleware
│   │   ├── routes/      # Admin API routes
│   │   └── tools/       # Tool implementations
│   └── public/admin/    # Built admin UI (generated)
├── cli/                 # CLI management tool
│   └── src/
│       ├── index.ts     # CLI entry point
│       └── commands/    # secret, status, tools, config
├── admin-ui/            # React admin interface
│   └── src/
│       ├── App.tsx      # Main app with routing
│       ├── api/         # API client
│       └── pages/       # Dashboard, Credentials, Tools
├── supabase/            # Database migrations
├── .mcp.json            # Project MCP config
└── README.md            # This file
```

---

## License

MIT

---

**Built with:**
- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Supabase](https://supabase.com/) for database
- [Railway](https://railway.app/) for hosting
- React + Vite + Tailwind CSS for Admin UI
- Commander.js for CLI
- TypeScript + Node.js
