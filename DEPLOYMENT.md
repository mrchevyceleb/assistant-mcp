# Deployment Guide

This guide walks through deploying the MCP server to Railway and configuring it for use.

## Prerequisites

- [ ] GitHub account
- [ ] Railway account (sign up at railway.app)
- [ ] Supabase project
- [ ] API keys for services you want to use

## Step 1: Deploy to Railway

### Option A: Deploy from GitHub (Recommended)

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `mrchevyceleb/assistant-mcp`
5. Railway will auto-detect the configuration from `railway.json`

### Option B: Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to project
cd assistant-mcp
railway link

# Deploy
railway up
```

## Step 2: Configure Environment Variables

In Railway dashboard, go to Variables and add:

### Required Variables

```bash
# Server
PORT=3000
NODE_ENV=production
MCP_AUTH_TOKEN=mcp_live_$(openssl rand -hex 32)

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
ENCRYPTION_KEY=$(openssl rand -hex 32)

# API Keys (optional - can be stored in Supabase later)
BRAVE_SEARCH_API_KEY=your_key
PERPLEXITY_API_KEY=your_key
GEMINI_API_KEY=your_key
GITHUB_TOKEN=ghp_your_token
VERCEL_TOKEN=your_token
```

### Generate Tokens

```bash
# Generate MCP auth token
openssl rand -hex 32

# Generate encryption key
openssl rand -hex 32
```

Copy these values to Railway environment variables.

## Step 3: Run Supabase Migrations

### Option A: Supabase Dashboard

1. Go to your Supabase project
2. Click "SQL Editor"
3. Copy contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and run

### Option B: Supabase CLI

```bash
cd assistant-mcp
supabase link --project-ref your-project-ref
supabase db push
```

## Step 4: Store API Credentials

### Option A: Use Setup Script

```bash
cd server
npm install
cp .env.example .env

# Edit .env with your values
# Then run:
npm run setup-credentials
```

### Option B: Manual via Supabase

Insert directly into the `credentials` table with encrypted values.

## Step 5: Test Deployment

```bash
# Check health endpoint
curl https://your-app.up.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-01-20T...",
#   "uptime": 123.45
# }
```

## Step 6: Configure Claude Code

### Update `.mcp.json`

**Location:** `C:\Users\mtjoh\OneDrive\Documents\ASSISTANT-HUB\Assistant\.mcp.json`

```json
{
  "mcpServers": {
    "matt": {
      "command": "node",
      "args": ["C:/Users/mtjoh/OneDrive/Documents/ASSISTANT-HUB/Assistant/assistant-mcp/server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_KEY": "your_service_key",
        "ENCRYPTION_KEY": "your_32_char_key",
        "MCP_AUTH_TOKEN": "mcp_live_your_token"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

**Note:** For now, we're running the server locally (not via Railway). This avoids network latency and simplifies the setup. The server reads from the local Supabase database.

### Enable in `~/.claude.json`

Edit `C:\Users\mtjoh\.claude.json` and find the Assistant project entry. Add `"matt"` to the `enabledMcpjsonServers` array:

```json
"projects": {
  "C:/Users/mtjoh/OneDrive/Documents/ASSISTANT-HUB/Assistant": {
    "enabledMcpjsonServers": ["matt", "playwright"],
    "hasTrustDialogAccepted": true
  }
}
```

## Step 7: Build the Server

```bash
cd assistant-mcp/server
npm install
npm run build
```

## Step 8: Restart Claude Code

Restart Claude Code to load the new MCP server.

## Step 9: Test Tools

Within Claude Code, test the tools:

```
/mcp                    # List available MCPs (should see "matt")
list_capabilities       # See all tools
server_status          # Check health
list_tasks             # Test task tools
search_memory          # Test memory tools
```

## Step 10: Migrate Data (Optional)

### Migrate Tasks

```bash
cd assistant-mcp/server
export TASKS_DIR="../../01-Active/tasks"
npm run migrate-tasks
```

### Migrate Memory

Edit `scripts/migrate-memory.ts` with actual memory data, then:

```bash
npm run migrate-memory
```

## Troubleshooting

### Server won't start

Check Railway logs:
```bash
railway logs
```

Common issues:
- Missing environment variables
- Supabase connection failed
- Build errors

### MCP not loading in Claude Code

1. Check `~/.claude.json` has `"matt"` in `enabledMcpjsonServers`
2. Restart Claude Code
3. Check server build: `cd assistant-mcp/server && npm run build`
4. Check server can start: `node dist/index.js` (should see "MCP server started")

### Tools not working

1. Check `server_status` tool output
2. Verify API credentials are stored
3. Check Railway logs for errors
4. Verify Supabase tables exist

### Cross-machine sync issues

Remember:
- `.mcp.json` syncs via OneDrive ✅
- `~/.claude.json` does NOT sync ❌ (must enable "matt" on each machine)
- Server code syncs via git ✅

## Next Steps

- [ ] Deploy to Railway
- [ ] Run Supabase migrations
- [ ] Configure environment variables
- [ ] Build server locally
- [ ] Configure Claude Code
- [ ] Test all tools
- [ ] Migrate existing data
- [ ] Test on second computer
- [ ] Weekend 2: Add OAuth tools (Gmail, Calendar)
