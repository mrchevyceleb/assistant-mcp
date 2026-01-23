# Matt's Assistant MCP Server

A consolidated MCP server providing 71 tools for tasks, memory, search, image generation, GitHub, Vercel, HubSpot, Monday.com, n8n, and Google Calendar.

## Why This Exists

**Before:** 12+ standalone MCPs, 350+ tools bloating context, config sync nightmares across 4 computers.

**After:** 1 unified MCP with ~71 focused tools, database-backed state, works identically everywhere.

## Quick Start

### 1. Install Dependencies

```bash
cd assistant-mcp/server
npm install
```

### 2. Configure Environment

The MCP gets its environment from `.mcp.json` in the project root. Required variables:

```json
{
  "assistant-mcp": {
    "command": "npx",
    "args": ["tsx", "src/index.ts"],
    "cwd": "./assistant-mcp/server",
    "env": {
      "SUPABASE_URL": "https://your-project.supabase.co",
      "SUPABASE_SERVICE_KEY": "your-service-key",
      "ENCRYPTION_KEY": "your-32-byte-hex-key",
      "MCP_AUTH_TOKEN": "mcp_live_your_token",
      "NODE_ENV": "production",
      "GOOGLE_OAUTH_CREDENTIALS": "/path/to/gcp-oauth.keys.json"
    }
  }
}
```

### 3. Enable in Claude Code

Edit `~/.claude.json` and add `"assistant-mcp"` to the project's `enabledMcpjsonServers` array.

### 4. Restart Claude Code

The MCP starts automatically when Claude Code launches.

## Architecture

```
Claude Code ──► stdio ──► assistant-mcp ──► Supabase (State)
                               │
                               ├── Brave Search API
                               ├── Perplexity API
                               ├── Gemini API (images)
                               ├── GitHub API
                               ├── Vercel API
                               ├── HubSpot API
                               ├── Monday.com API
                               ├── n8n API
                               └── Google Calendar API
```

## Tool Categories (71 total)

| Category | Count | Tools |
|----------|-------|-------|
| **Meta** | 4 | `help`, `list_capabilities`, `server_status`, `tool_usage_stats` |
| **Tasks** | 8 | `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`, `delete_task`, `urgent_tasks`, `process_inbox` |
| **Memory** | 4 | `save_memory`, `search_memory`, `recent_memories`, `delete_memory` |
| **Search** | 3 | `web_search` (Brave), `deep_research` (Perplexity), `quick_search` (Perplexity) |
| **Images** | 2 | `generate_image`, `edit_image` (Gemini 2.0 Flash) |
| **GitHub** | 4 | `create_issue`, `create_pr`, `search_code`, `list_repos` |
| **Vercel** | 3 | `deploy_site`, `list_deployments`, `get_deployment_url` |
| **HubSpot** | 8 | `hubspot_list_contacts`, `hubspot_get_contact`, `hubspot_create_contact`, `hubspot_list_deals`, `hubspot_create_deal`, `hubspot_list_companies`, `hubspot_search` |
| **Monday.com** | 14 | `monday_list_boards`, `monday_get_board`, `monday_list_items`, `monday_get_item`, `monday_create_item`, `monday_update_item`, `monday_create_update`, `monday_move_item`, `monday_archive_item`, `monday_delete_item`, `monday_search_items`, `monday_get_groups`, `monday_create_group` |
| **n8n** | 14 | `n8n_list_workflows`, `n8n_get_workflow`, `n8n_activate_workflow`, `n8n_execute_workflow`, `n8n_list_executions`, `n8n_get_execution`, `n8n_create_workflow`, `n8n_update_workflow`, `n8n_add_node`, `n8n_update_node`, `n8n_remove_node`, `n8n_delete_workflow`, `n8n_duplicate_workflow` |
| **Calendar** | 7 | `list_calendars`, `list_events`, `create_event`, `get_event`, `update_event`, `delete_event`, `get_freebusy` |

## Credentials

API keys are stored encrypted in Supabase. Current credentials:

| Service | Key Name | Used By |
|---------|----------|---------|
| Brave Search | `brave_search` | `web_search` |
| Perplexity | `perplexity` | `deep_research`, `quick_search` |
| Gemini | `gemini` | `generate_image`, `edit_image` |
| GitHub | `github` | `create_issue`, `create_pr`, etc. |
| Vercel | `vercel` | `deploy_site`, etc. |
| HubSpot | `hubspot` | All `hubspot_*` tools |
| Monday.com | `monday` | All `monday_*` tools |
| n8n | `n8n` | All `n8n_*` tools |

Google Calendar uses OAuth (token stored in Supabase `oauth_tokens` table).

## Development

### Project Structure

```
assistant-mcp/
├── server/
│   ├── src/
│   │   ├── index.ts          # Main entry, tool loading, MCP server
│   │   ├── tools/            # Tool implementations
│   │   │   ├── meta.ts       # help, list_capabilities, server_status
│   │   │   ├── tasks.ts      # Task management
│   │   │   ├── memory.ts     # Memory/persistence
│   │   │   ├── search.ts     # Brave, Perplexity
│   │   │   ├── images.ts     # Gemini image generation
│   │   │   ├── github.ts     # GitHub API
│   │   │   ├── vercel.ts     # Vercel deployments
│   │   │   ├── hubspot.ts    # HubSpot CRM
│   │   │   ├── monday.ts     # Monday.com boards
│   │   │   ├── n8n.ts        # n8n workflows
│   │   │   └── calendar.ts   # Google Calendar
│   │   ├── lib/
│   │   │   ├── encryption.ts # Credential storage/retrieval
│   │   │   ├── supabase.ts   # Database client
│   │   │   └── logger.ts     # Logging
│   │   ├── middleware/
│   │   │   └── auth.ts       # API authentication
│   │   └── routes/
│   │       └── admin.ts      # Admin API endpoints
│   ├── dist/                 # Compiled JavaScript (generated)
│   └── package.json
├── cli/                      # CLI management tool (optional)
├── admin-ui/                 # React admin dashboard (optional)
├── ADD-INTEGRATION-GUIDE.md  # How to add new services
├── DEPLOYMENT.md             # Remote deployment guide
├── CHANGELOG.md              # Version history
└── README.md                 # This file
```

### Adding a New Integration

See [ADD-INTEGRATION-GUIDE.md](./ADD-INTEGRATION-GUIDE.md) for step-by-step instructions.

Quick summary:
1. Create `server/src/tools/{service}.ts`
2. Add import to `server/src/index.ts` toolModules array
3. Store API key: use `storeCredential('{service}', 'key')`
4. Restart Claude Code

### Making Code Changes

**Important:** The MCP now uses `tsx` to run TypeScript directly. This means:

- **Minor edits** (changing logic in existing tools) take effect on next MCP restart
- **Structural changes** (new files, new exports) require Claude Code restart
- No manual `npm run build` needed for most changes

**If changes don't appear:**
1. Check for TypeScript errors: `npm run build`
2. Restart Claude Code completely (not just a new conversation)
3. Use `/redeploy` command for guided restart

### Scripts

```bash
npm start          # Run with tsx (auto-compiles TypeScript)
npm run build      # Compile TypeScript to JavaScript
npm run dev        # Run with tsx watch mode (auto-reload)
npm run typecheck  # Check types without compiling
```

## HTTP Admin API

The server also runs an HTTP server on port 9001 for administration:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | No | Health check |
| `GET /tools` | Yes | List all tools |
| `POST /tools/call` | Yes | Execute a tool |
| `POST /reload` | Yes | Rebuild and reload tools |
| `GET /admin/api/dashboard` | Yes | Dashboard data |
| `GET /admin/api/credentials` | Yes | List credentials |

Auth requires `Authorization: Bearer {MCP_AUTH_TOKEN}` header.

## Troubleshooting

### MCP not appearing in Claude Code

1. Check `.mcp.json` syntax is valid JSON
2. Verify `~/.claude.json` has `"assistant-mcp"` in `enabledMcpjsonServers`
3. Restart Claude Code

### Tools timing out

1. Check Supabase connection: `server_status` tool
2. Verify API credentials are stored
3. Check for network issues

### Code changes not working

1. Restart Claude Code (the MCP process keeps old code in memory)
2. If still broken, check for TypeScript errors: `npm run build`
3. Check server logs for loading errors

### Credential not found errors

Store the credential in Supabase:
```typescript
import { storeCredential } from './lib/encryption.js';
await storeCredential('service_name', 'your-api-key');
```

## Multi-Computer Setup

This folder syncs via OneDrive. Per-machine setup required:

1. `npm install` in `server/` directory
2. Enable `"assistant-mcp"` in `~/.claude.json`
3. For Calendar: run OAuth flow once per machine

## Security

- API keys encrypted with AES-256-GCM
- Per-credential salt
- OAuth tokens stored encrypted
- No plaintext secrets in code or logs

## License

MIT
