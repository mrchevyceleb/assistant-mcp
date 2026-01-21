# Assistant MCP - Multi-Computer Setup Checklist

**Date:** January 21, 2026  
**Status:** Mac ✅ | Windows 🔄 | MacBook Pro ⏸️

---

## ✅ Completed: Mac Mini (Skaro)

1. ✅ Server built (`dist/` folder exists)
2. ✅ Dependencies installed
3. ✅ `.mcp.json` updated with relative path: `./assistant-mcp/server`
4. ✅ Enabled in `~/.claude.json`: `"enabledMcpjsonServers": ["assistant-mcp"]`
5. ✅ Trust dialog accepted: `"hasTrustDialogAccepted": true`

**Next:** Restart Claude Code on Mac to load the MCP

---

## 🔄 To-Do: Windows PC (Gondor)

### Step 1: Update `.mcp.json` (Already synced via OneDrive)

The `.mcp.json` now uses a relative path that works on both systems:
```json
"assistant-mcp": {
  "command": "npm",
  "args": ["start"],
  "cwd": "./assistant-mcp/server"
}
```

### Step 2: Enable in `~/.claude.json`

**Location:** `C:\Users\mtjoh\.claude.json`

Find the Assistant project entry and ensure these values:

```json
"C:/Users/mtjoh/OneDrive/Documents/ASSISTANT-HUB/Assistant": {
  "enabledMcpjsonServers": ["assistant-mcp"],
  "hasTrustDialogAccepted": true
}
```

**How to edit:**
1. Open `C:\Users\mtjoh\.claude.json` in VS Code or Notepad
2. Find the Assistant project path
3. Add `"assistant-mcp"` to `enabledMcpjsonServers` array (if not already there)
4. Set `"hasTrustDialogAccepted": true`
5. Save the file

### Step 3: Verify Server is Built

```powershell
cd C:\Users\mtjoh\OneDrive\Documents\ASSISTANT-HUB\Assistant\assistant-mcp\server
dir dist\index.js
```

If `dist\index.js` doesn't exist, build it:
```powershell
npm run build
```

### Step 4: Test Server Manually (Optional)

```powershell
cd C:\Users\mtjoh\OneDrive\Documents\ASSISTANT-HUB\Assistant\assistant-mcp\server
npm start
```

Should see: `"MCP server started on stdio"`

Press Ctrl+C to stop.

### Step 5: Restart Claude Code

Close and reopen Claude Code to load the MCP.

### Step 6: Test Tools

In Claude Code, try:
- `/mcp` - Should see "assistant-mcp" listed
- `list_tasks` - Test tasks tool
- `server_status` - Check server health

---

## ⏸️ Future: MacBook Pro (Travel)

Same steps as Windows PC:
1. `.mcp.json` already synced via OneDrive ✅
2. Enable in `~/.claude.json`
3. Build server if needed: `npm run build`
4. Restart Claude Code

---

## What This MCP Does

**Consolidates 12+ MCPs into 1 remote server:**
- Tasks (database-backed, replaces markdown files)
- Memory (database-backed, replaces memory-bank MCP)
- Search (Brave + Perplexity)
- Images (Gemini via nanobanana)
- GitHub (issues, PRs, repos)
- Vercel (deployments)
- Email (Coming soon - Gmail integration)
- Calendar (Coming soon - Google Calendar)
- CRM (Coming soon - HubSpot + GHL)

**Benefits:**
- ~50 focused tools instead of 350+
- Single Supabase database syncs across all computers
- One OAuth setup (stored in Supabase)
- Consistent behavior everywhere
- CLI and Web UI for management

---

## Troubleshooting

### MCP not appearing in Claude Code

1. Check `.mcp.json` syntax is valid (no trailing commas)
2. Verify `~/.claude.json` has `"assistant-mcp"` in `enabledMcpjsonServers`
3. Check server is built: `dist/index.js` exists
4. Restart Claude Code

### Server won't start

1. Check dependencies installed: `npm install`
2. Check build exists: `npm run build`
3. Try running manually: `npm start`
4. Check console for errors

### Tools not working

1. Test `server_status` tool first
2. Check Supabase credentials in `.mcp.json` env vars
3. Verify database tables exist (run migrations)
4. Check server logs for errors

---

## Configuration Files

**Syncs via OneDrive:**
- `.mcp.json` (project-level MCP definitions)
- `assistant-mcp/server/src/` (all code)
- `assistant-mcp/server/dist/` (built code)

**Per-Machine (doesn't sync):**
- `~/.claude.json` (MCP approvals/enablements)
- `assistant-mcp/server/node_modules/` (dependencies - must run `npm install` per machine)

---

## Next Steps After Setup

1. Test all tool categories
2. Migrate existing tasks from markdown to database
3. Migrate memories to database
4. Set up CLI tool: `cd cli && npm install && npm run build && npm link`
5. Try Web Admin UI: `cd admin-ui && npm run dev`
6. Weekend 2: Add Gmail OAuth
7. Weekend 3: Add Calendar OAuth
