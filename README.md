# Matt's Remote MCP Server

Production-ready remote MCP server that consolidates 12+ MCPs into a single server with ~50 focused tools.

## 🎯 Problem Solved

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

## 🏗️ Architecture

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
```

## 📦 What's Included

### Tool Categories (~50 tools)

| Category | Tools | Description |
|----------|-------|-------------|
| **Meta** | 4 | help, list_capabilities, server_status, tool_usage_stats |
| **Tasks** | 8 | list, get, create, update, complete, delete, urgent, process_inbox |
| **Memory** | 4 | save, search, recent, delete |
| **Search** | 3 | web_search, deep_research, quick_search |
| **Images** | 2 | generate_image, edit_image |
| **GitHub** | 4 | create_issue, create_pr, search_code, list_repos |
| **Deploy** | 3 | deploy_site, list_deployments, get_deployment_url |
| **Email** | 6 | (Weekend 2 - OAuth) |
| **Calendar** | 4 | (Weekend 2 - OAuth) |
| **CRM** | 8 | (Weekend 2 - HubSpot + GHL) |
| **Automation** | 2 | (Weekend 2 - n8n) |
| **Voice** | 2 | (Weekend 2 - ElevenLabs + Whisper) |
| **Finance** | 3 | (Weekend 2 - P&L Tracker) |

## 🚀 Setup

### 1. Deploy to Railway

1. Fork this repo
2. Connect to Railway
3. Add environment variables (see `.env.example`)
4. Deploy

### 2. Run Supabase Migrations

```bash
cd supabase
supabase db push
```

Or manually run `supabase/migrations/001_initial_schema.sql` in your Supabase SQL editor.

### 3. Store API Credentials

The server will automatically encrypt and store credentials in Supabase on first use. Alternatively, use the setup script:

```bash
cd server
npm install
node scripts/setup-credentials.js
```

### 4. Configure Claude Code (All Computers)

**File:** `.mcp.json` (project-level, syncs via OneDrive)

```json
{
  "mcpServers": {
    "matt": {
      "command": "npx",
      "args": ["-y", "@mattjohnston/assistant-mcp-client"],
      "env": {
        "MCP_SERVER_URL": "https://matt-mcp.up.railway.app",
        "MCP_AUTH_TOKEN": "mcp_live_your_token_here"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

**Don't forget:** Enable in `~/.claude.json` on each machine (see global CLAUDE.md for instructions).

## 🧪 Testing

### Local Development

```bash
# Terminal 1: Start server
cd server
npm install
npm run dev

# Terminal 2: Test client
cd client
npm install
npm run build
node dist/index.js
```

### Test Health Check

```bash
curl https://matt-mcp.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-20T...",
  "uptime": 1234.56
}
```

## 📊 Database Schema

See `supabase/migrations/001_initial_schema.sql` for complete schema.

**Key tables:**
- `tasks` - Replaces markdown task files
- `memory` - Replaces memory-bank MCP
- `credentials` - Encrypted API keys
- `oauth_tokens` - OAuth tokens (Gmail, Calendar, etc.)
- `inbox` - Replaces inbox.md
- `tool_usage` - Usage analytics
- `server_health` - Health logs

## 🔐 Security

- API keys encrypted with AES-256-GCM
- Separate encryption salt per credential
- Auth token required for all requests
- OAuth tokens auto-refreshed
- No plaintext secrets in code or logs

## 📈 Monitoring

Use meta tools within Claude Code:

```
server_status
tool_usage_stats
help("tasks")
list_capabilities
```

Or check Railway logs for detailed server activity.

## 🛠️ Development

### Adding a New Tool

1. Create tool in `server/src/tools/category.ts`
2. Register with `registerTool(name, category, description, schema)`
3. Import in `server/src/index.ts`
4. Add to `allTools` object
5. Rebuild and redeploy

### Running Migrations

```bash
cd supabase
supabase migration new your_migration_name
# Edit the generated SQL file
supabase db push
```

## 📝 Migration from Old MCPs

See `scripts/migrate-tasks.ts` and `scripts/migrate-memory.ts` for migration helpers.

**Summary:**
1. Run Supabase migrations
2. Migrate tasks: `node scripts/migrate-tasks.js`
3. Migrate memory: `node scripts/migrate-memory.js`
4. Remove old MCPs from `.mcp.json`
5. Update `CLAUDE.md` with new architecture

## 🤝 Contributing

This is a personal project, but feel free to fork and adapt for your own use.

## 📄 License

MIT

---

**Built with:**
- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Supabase](https://supabase.com/) for database
- [Railway](https://railway.app/) for hosting
- TypeScript + Node.js
