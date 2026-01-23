# Assistant MCP Changelog

## January 23, 2026 - TSX Runtime & Robustness Improvements

### Changes

**1. Switched to TSX Runtime**
- MCP now runs TypeScript directly via `tsx` instead of pre-compiled JavaScript
- No more "stale code" issues from cached compiled files
- `.mcp.json` updated: `"command": "npx", "args": ["tsx", "src/index.ts"]`

**2. Image Generation Fixed**
- Model updated to `gemini-2.0-flash-exp` (correct model for image generation)
- Removed invalid `imageGenerationConfig` parameter
- Tested and working

**3. Added /redeploy Command**
- New slash command at `~/.claude/commands/redeploy.md`
- Guides through restarting the MCP when needed

**4. Documentation Overhaul**
- Completely rewrote README.md with accurate tool counts (71 tools)
- Updated ADD-INTEGRATION-GUIDE.md with clearer instructions
- Consolidated all setup info

### Tool Count: 71

| Category | Count |
|----------|-------|
| Meta | 4 |
| Tasks | 8 |
| Memory | 4 |
| Search | 3 |
| Images | 2 |
| GitHub | 4 |
| Vercel | 3 |
| HubSpot | 8 |
| Monday.com | 14 |
| n8n | 14 |
| Calendar | 7 |

---

## January 23, 2026 - Monday.com Integration

### Added
- Full Monday.com integration with 14 tools
- Board, item, group, and update management
- GraphQL-based API implementation

---

## January 21, 2026 - Calendar Integration & Port Update

### Changes

**1. Google Calendar Integration**
- Added 7 calendar tools directly into assistant-mcp
- Tools: `list_calendars`, `list_events`, `create_event`, `get_event`, `update_event`, `delete_event`, `get_freebusy`
- Removed need for separate google-calendar MCP

**2. Port Change**
- HTTP admin port changed from 3000 to 9001
- Avoids conflicts with common dev servers

**3. MCP Consolidation**
- Down to 3 MCPs total: assistant-mcp, playwright, unified-gmail
- Calendar now part of assistant-mcp

---

## January 20, 2026 - Initial Release

### Features
- Consolidated MCP replacing 12+ standalone MCPs
- Database-backed tasks and memory (Supabase)
- Encrypted credential storage
- Tools: meta, tasks, memory, search, images, GitHub, Vercel, HubSpot, n8n
- HTTP admin API with authentication
- CLI tool for management
- React admin UI (optional)

### Architecture
- TypeScript + Node.js
- Supabase for state persistence
- AES-256-GCM encryption for credentials
- Stdio transport for Claude Code integration
