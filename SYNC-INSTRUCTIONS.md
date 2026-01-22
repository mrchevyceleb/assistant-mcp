# Assistant MCP - Sync Instructions

**Updated:** January 22, 2026  
**Reason:** Bulletproof edition deployed - server more reliable now

---

## What Changed

The server was completely overhauled to be more reliable:
- Retries database connections (3 attempts)
- Runs in "degraded mode" if database unavailable
- One broken tool doesn't crash others
- Auto-finds available port if default is taken
- Comprehensive logging to `server/logs/`

---

## What You Need to Do (Per Computer)

### Quick Version

```bash
cd assistant-mcp/server
npm run build
```

That's it. Dependencies should already be installed.

### If Build Fails

```bash
cd assistant-mcp/server
npm install
npm run build
```

### Verify It Works

```bash
cd assistant-mcp
./diagnose.sh
```

---

## After Rebuilding

1. **Restart Claude Code** (or OpenCode)
2. Test a tool: Ask Claude to run `server_status`
3. Check logs: `tail -f server/logs/combined.log`

---

## What's New

| Feature | Before | After |
|---------|--------|-------|
| Database down | Server crashed | Degraded mode (most tools work) |
| Port 9001 taken | Server failed | Auto-tries 9002, 9003, etc. |
| Tool fails to load | All tools crashed | Other tools continue |
| No logs/ directory | Startup failed | Auto-created |
| Errors | Silent | Logged to server/logs/ |

---

## Files That Changed

- `server/src/index.ts` - Main server (major rewrite)
- `server/src/lib/supabase.ts` - Database connection with retries
- `server/src/lib/logger.ts` - Better logging, auto-create logs/

---

## Troubleshooting

**MCP doesn't appear in Claude Code:**
1. Check `~/.claude.json` has `"assistant-mcp"` in `enabledMcpjsonServers`
2. Restart Claude Code

**Tools don't work:**
1. Run `./diagnose.sh` in assistant-mcp folder
2. Check `server/logs/error.log`

**"Degraded mode" in health check:**
- Database unavailable (check Supabase credentials in `.mcp.json`)
- Most tools still work (search, images, GitHub, etc.)
- Tasks/Memory tools won't work until DB reconnects

---

## Health Check

While Claude Code is running:

```bash
curl http://localhost:9001/health
```

Or try ports 9002-9010 if 9001 doesn't respond.
