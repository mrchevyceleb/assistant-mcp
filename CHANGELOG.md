# Assistant MCP Changelog

## January 21, 2026 - Calendar Integration & Port Update

### ✅ Major Changes

**1. Google Calendar Integration**
- Integrated 7 calendar tools directly into assistant-mcp server
- Removed dependency on separate `google-calendar` MCP
- Tools added:
  - `list_calendars` - View all calendars
  - `list_events` - Show upcoming events
  - `create_event` - Schedule new events
  - `get_event` - Get event details
  - `update_event` - Modify events
  - `delete_event` - Remove events
  - `get_freebusy` - Check availability
- Total tool count: **48** (was 41)

**2. Port Change**
- Changed default HTTP port from 3000 → 9001
- Reason: Avoid conflicts with common dev servers (React, Next.js, etc.)
- Updated in:
  - `server/src/index.ts` (default port)
  - `server/.env` and `.env.example`
  - `cli/src/lib/db.ts`
  - `admin-ui/src/api/client.ts`
  - All documentation

**3. MCP Configuration Simplification**
- OpenCode now uses **3 MCPs** (down from 4):
  - `assistant-mcp` (48 tools - includes calendar)
  - `playwright` (~15 tools)
  - `unified-gmail` (~10 tools)
- Calendar is now part of assistant-mcp instead of separate

### 📝 Files Updated

**Code Files (Pushed to GitHub):**
- ✅ `server/src/tools/calendar.ts` - NEW: Calendar integration
- ✅ `server/src/index.ts` - Import calendar tools, change default port
- ✅ `server/.env` - Update PORT to 9001
- ✅ `server/.env.example` - Update PORT to 9001
- ✅ `cli/src/lib/db.ts` - Update default port
- ✅ `admin-ui/src/api/client.ts` - Update default port
- ✅ `DEPLOYMENT.md` - Update port references
- ✅ `README.md` - Update port references
- ✅ `server/package.json` - Add googleapis dependencies

**Documentation Files (OneDrive Only - Not in Git):**
- ✅ `OPENCODE-SETUP-GUIDE.md` - Complete rewrite with calendar integration
- ✅ `SETUP-BLUEPRINT.md` - Updated to 3-MCP setup, added calendar to assistant-mcp
- ⚠️ These files contain OAuth credentials and should NOT be pushed to GitHub

**Configuration Files (Per-Machine):**
- ✅ `~/.config/opencode/opencode.json` - Added GOOGLE_OAUTH_CREDENTIALS env var to assistant-mcp

### 🔧 Setup Required on Other Computers

**Windows (Gondor) & Mac Mini (Skaro):**

1. **Pull latest code:**
   ```bash
   cd assistant-mcp
   git pull
   ```

2. **Install new dependencies:**
   ```bash
   cd server
   npm install
   npm run build
   ```

3. **Update OpenCode config** (`~/.config/opencode/opencode.json`):
   - Add to assistant-mcp environment vars:
     ```json
     "GOOGLE_OAUTH_CREDENTIALS": "[path-to-gcp-oauth.keys.json]"
     ```
   - Remove the separate `google-calendar` MCP entry (if present)

4. **Authenticate Google Calendar** (one-time per computer):
   ```bash
   GOOGLE_OAUTH_CREDENTIALS="[path]" npx -y @cocal/google-calendar-mcp auth
   ```

5. **Restart OpenCode:**
   ```bash
   pkill -f assistant-mcp  # Kill existing process
   opencode mcp list       # Verify connection
   ```

### 🎯 Benefits

**Before:**
- 4 separate MCPs
- Calendar tools only accessible as separate MCP
- Port 3000 conflicts with dev servers
- ~74 total tools

**After:**
- 3 MCPs total
- Calendar integrated into assistant-mcp (always available with email, tasks, etc.)
- Port 9001 avoids dev server conflicts
- ~73 total tools (same functionality, better organized)

### 📊 Current Tool Breakdown

**assistant-mcp (48 tools):**
- Meta: 4 tools
- Tasks: 8 tools
- Memory: 4 tools
- Search: 3 tools
- Images: 2 tools
- GitHub: 4 tools
- Vercel: 3 tools
- HubSpot: 7 tools
- n8n: 6 tools
- **Calendar: 7 tools** ← NEW

**playwright:** ~15 tools  
**unified-gmail:** ~10 tools

**Total:** ~73 tools

### ⚠️ Important Notes

1. **Setup guides contain credentials** - They're safe in OneDrive but should NEVER be pushed to GitHub
2. **Per-machine OAuth required** - Each computer needs to run the calendar auth flow once
3. **Port change is breaking** - Old port 3000 references won't work anymore
4. **Restart required** - OpenCode must be restarted to load the updated assistant-mcp

### 🐛 Known Issues

None - All changes tested and working on MacBook Pro.

### 📚 Documentation

- **Primary Setup Guide:** `OPENCODE-SETUP-GUIDE.md` (complete multi-computer setup)
- **Quick Reference:** `SETUP-BLUEPRINT.md` (copy-paste configs)
- **This File:** `CHANGELOG.md` (what changed and why)

---

**Next Steps:**
- Set up calendar integration on Windows (Gondor)
- Set up calendar integration on Mac Mini (Skaro)
- Test all 48 tools in a new OpenCode session
