# Assistant MCP - Bulletproof Setup & Troubleshooting

**Last Updated:** January 22, 2026  
**Status:** Production-Ready with Degraded Mode Support

---

## What Makes This Bulletproof

### 1. **Graceful Degradation**
- ✅ Supabase connection failures → Runs in degraded mode (tools still work, no database logging)
- ✅ Individual tool failures → Other tools continue working
- ✅ HTTP server fails → MCP stdio continues (core functionality preserved)
- ✅ Missing API keys → Only affected tools disabled, rest work fine

### 2. **Retry Logic**
- Supabase: 3 connection attempts with exponential backoff
- Tool loading: Individual failures don't crash entire server
- Logging: Non-blocking, failures don't affect tool execution

### 3. **Comprehensive Logging**
- All errors logged to `server/logs/error.log`
- Full activity logged to `server/logs/combined.log`
- Development mode: Also logs to stderr (won't corrupt MCP stdio)
- Production mode: Silent stdio, file logs only

### 4. **Startup Validation**
- Environment variable checks with detailed warnings
- Database connectivity test before marking "ready"
- Tool loading with per-module error handling
- Graceful shutdown on SIGTERM/SIGINT

---

## Quick Start (Multi-Computer Setup)

### Initial Setup (Once Per Computer)

```bash
cd assistant-mcp/server

# Install dependencies
npm install

# Build TypeScript → JavaScript
npm run build

# Verify build succeeded
ls -la dist/index.js
```

### Environment Setup

The `.mcp.json` has all your secrets, but you can also create `server/.env` for overrides:

```env
# Optional - only if you want to override .mcp.json values
SUPABASE_URL=https://iycloielqcjnjqddeuet.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
ENCRYPTION_KEY=your-encryption-key
MCP_AUTH_TOKEN=your-auth-token
NODE_ENV=production
LOG_LEVEL=info
```

### Enable in Claude Code

Edit `~/.claude.json` (this file does NOT sync via OneDrive):

```json
{
  "projects": {
    "/Users/mjohnst/.../ASSISTANT-HUB/Assistant": {
      "enabledMcpjsonServers": ["assistant-mcp"],
      "hasTrustDialogAccepted": true
    }
  }
}
```

**CRITICAL:** Restart Claude Code after editing this file.

---

## Verifying It Works

### 1. Check Logs Immediately After Start

```bash
cd assistant-mcp/server
tail -f logs/combined.log
```

Look for these lines (should appear in first 3 seconds):

```
✓ MCP server started on stdio
✓ Registered 50 tools
✓ Database: connected (or "degraded mode (file-based fallback)")
✓ HTTP server listening on port 9001
```

### 2. Health Check (While Claude Code Is Running)

```bash
curl http://localhost:9001/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-22T...",
  "uptime": 123.45,
  "database": "connected",
  "tools": {
    "total": 50,
    "categories": ["meta", "tasks", "memory", ...]
  }
}
```

### 3. Test Tool in Claude Code

Type this in Claude Code chat:

```
Can you call the server_status tool?
```

Expected response: JSON with server info, tool counts, database status.

---

## Common Failure Modes & Fixes

### ❌ MCP Doesn't Appear in Claude Code

**Symptoms:** No assistant-mcp tools available, MCP not listed in `/mcp` command

**Diagnosis:**
```bash
# 1. Check if .mcp.json is valid JSON
cat .mcp.json | python3 -m json.tool

# 2. Check if enabled in ~/.claude.json
cat ~/.claude.json | grep -A 5 "enabledMcpjsonServers"

# 3. Check if server built
ls -la assistant-mcp/server/dist/index.js
```

**Fixes:**
1. Fix JSON syntax in `.mcp.json`
2. Add `"assistant-mcp"` to `enabledMcpjsonServers` array
3. Run `cd assistant-mcp/server && npm run build`
4. **Restart Claude Code** (critical!)

---

### ❌ Server Starts But Tools Don't Work

**Symptoms:** Server starts, health check passes, but tool calls fail

**Diagnosis:**
```bash
# Check error logs
tail -50 assistant-mcp/server/logs/error.log

# Check if Supabase connected
curl http://localhost:9001/health | grep database
```

**Fixes:**
1. **Supabase connection failed:**
   - Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.mcp.json`
   - Verify Supabase project is not paused
   - Server will run in degraded mode (tasks/memory disabled but other tools work)

2. **API keys missing:**
   - Check tool-specific env vars (BRAVE_API_KEY, GITHUB_TOKEN, etc.)
   - Tools with missing keys will fail, but won't crash server

3. **Tool-specific errors:**
   - Check `logs/error.log` for specific error messages
   - Each tool logs its own failures

---

### ❌ Database Shows "degraded" in Health Check

**Symptoms:** `"database": "degraded"` in `/health` response

**This is OKAY if you don't need database features:**
- Tasks/Memory tools won't work
- Everything else (search, images, GitHub, Vercel) works fine
- No tool usage logging (but tools still execute)

**To fix (if you want database):**
```bash
# Test Supabase connection manually
cd assistant-mcp/server
node -e "
  import('@supabase/supabase-js').then(({ createClient }) => {
    const client = createClient(
      'https://iycloielqcjnjqddeuet.supabase.co',
      'YOUR_SERVICE_KEY'
    );
    client.from('tasks').select('count').limit(1).then(console.log);
  });
"
```

**Common Supabase issues:**
- Service key expired → Get new one from Supabase dashboard
- Project paused → Unpause in Supabase dashboard
- Network issues → Retry logic handles this (3 attempts)

---

### ❌ HTTP Server Failed (Port Already in Use)

**Symptoms:** Logs show "HTTP server failed to start" but MCP still works

**This is OKAY:**
- MCP stdio works (core functionality intact)
- Only affects admin UI and health endpoint
- Tools still work perfectly in Claude Code

**To fix (if you want admin UI):**
```bash
# Find what's using port 9001
lsof -i :9001

# Kill it or change PORT in .mcp.json
"env": {
  "PORT": "9002"
}
```

---

### ❌ Logs Directory Missing

**Symptoms:** Server fails to start, "ENOENT: no such file or directory" in logs

**Fix:**
```bash
cd assistant-mcp/server
mkdir -p logs
npm start
```

**Permanent fix:** The bulletproof version now auto-creates this directory.

---

## Monitoring & Maintenance

### Check Server Health Anytime

```bash
# While Claude Code is running
curl http://localhost:9001/health

# Full status (requires auth token)
curl -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
  http://localhost:9001/api/status
```

### View Recent Errors

```bash
tail -20 assistant-mcp/server/logs/error.log
```

### View All Activity

```bash
tail -50 assistant-mcp/server/logs/combined.log
```

### Clear Old Logs

```bash
cd assistant-mcp/server
rm logs/*.log
# Logs will be recreated on next start
```

---

## Upgrading / Rebuilding

### After Changing Code

```bash
cd assistant-mcp/server
npm run build
# Then restart Claude Code
```

### After Pulling Changes (OneDrive Sync)

```bash
cd assistant-mcp/server
npm install  # In case dependencies changed
npm run build
# Then restart Claude Code
```

### Force Clean Rebuild

```bash
cd assistant-mcp/server
rm -rf dist node_modules
npm install
npm run build
```

---

## Per-Computer Differences

### What Syncs (via OneDrive)
- ✅ `assistant-mcp/server/src/` (TypeScript source)
- ✅ `.mcp.json` (MCP config with secrets)
- ✅ `package.json` and `package-lock.json`

### What Doesn't Sync (Per-Machine)
- ❌ `assistant-mcp/server/node_modules/` (must run `npm install`)
- ❌ `assistant-mcp/server/dist/` (must run `npm run build`)
- ❌ `assistant-mcp/server/logs/` (machine-specific logs)
- ❌ `~/.claude.json` (must manually add `"assistant-mcp"` to enabled list)

### Setup Checklist for New Computer

```bash
# 1. Pull repo (OneDrive should auto-sync)
cd ~/path/to/Assistant

# 2. Install dependencies
cd assistant-mcp/server
npm install

# 3. Build
npm run build

# 4. Edit ~/.claude.json
# Add "assistant-mcp" to enabledMcpjsonServers array

# 5. Restart Claude Code

# 6. Verify
curl http://localhost:9001/health
```

---

## Advanced: Running Without OneDrive

If you want to deploy to a remote server (Railway, etc.):

1. Push `assistant-mcp/` to GitHub
2. Deploy to Railway with env vars from `.mcp.json`
3. Update `.mcp.json` to use `npx @mattjohnston/assistant-mcp-client` (when published)
4. Point `MCP_SERVER_URL` to Railway URL

---

## Changelog

### January 22, 2026 - Bulletproof Edition
- ✅ Added Supabase retry logic (3 attempts with exponential backoff)
- ✅ Added graceful degradation (degraded mode if DB unavailable)
- ✅ Added per-tool error isolation (one tool failure doesn't crash server)
- ✅ Added comprehensive startup validation
- ✅ Added auto-creation of logs directory
- ✅ Improved error logging (all errors → error.log)
- ✅ Made HTTP server optional (MCP continues if HTTP fails)
- ✅ Added graceful shutdown handlers (SIGTERM, SIGINT)
- ✅ Added unhandled error catchers

### Previous Issues Fixed
- ❌ Server crashed if Supabase unreachable → Now degraded mode
- ❌ Server crashed if one tool failed to load → Now skips failed tools
- ❌ Server crashed if logs/ missing → Now auto-creates
- ❌ Silent failures (no logs) → Now comprehensive logging
- ❌ Stdio corruption from console.log → Now stderr/file only

---

## Need Help?

**Check logs first:**
```bash
tail -50 assistant-mcp/server/logs/error.log
```

**Common issues resolved by:**
1. Rebuild: `npm run build`
2. Restart Claude Code
3. Check `~/.claude.json` has `"assistant-mcp"` enabled
4. Verify `.mcp.json` is valid JSON

**If still broken:**
- Check health endpoint: `curl http://localhost:9001/health`
- Look for specific error in logs
- Verify environment variables are set correctly
