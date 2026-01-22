#!/bin/bash

# Assistant MCP Diagnostic Script
# Checks common failure points and provides actionable fixes

echo "🔍 Assistant MCP Diagnostic Tool"
echo "================================"
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Build exists
echo "1️⃣  Checking build..."
if [ -f "server/dist/index.js" ]; then
  echo "   ✅ Build exists: server/dist/index.js"
else
  echo "   ❌ Build missing: server/dist/index.js"
  echo "   Fix: cd server && npm run build"
  ((ERRORS++))
fi
echo ""

# Check 2: Dependencies installed
echo "2️⃣  Checking dependencies..."
if [ -d "server/node_modules" ]; then
  echo "   ✅ Dependencies installed: server/node_modules/"
else
  echo "   ❌ Dependencies missing: server/node_modules/"
  echo "   Fix: cd server && npm install"
  ((ERRORS++))
fi
echo ""

# Check 3: .mcp.json valid JSON
echo "3️⃣  Checking .mcp.json..."
if [ -f "../.mcp.json" ]; then
  if python3 -m json.tool ../.mcp.json > /dev/null 2>&1; then
    echo "   ✅ Valid JSON: .mcp.json"
  else
    echo "   ❌ Invalid JSON: .mcp.json"
    echo "   Fix: Check for syntax errors in .mcp.json"
    ((ERRORS++))
  fi
else
  echo "   ❌ Missing: .mcp.json"
  echo "   Fix: Restore .mcp.json from backup"
  ((ERRORS++))
fi
echo ""

# Check 4: assistant-mcp entry in .mcp.json
echo "4️⃣  Checking .mcp.json entry..."
if grep -q '"assistant-mcp"' ../.mcp.json 2>/dev/null; then
  echo "   ✅ Found: assistant-mcp entry in .mcp.json"
else
  echo "   ⚠️  Warning: No assistant-mcp entry in .mcp.json"
  ((WARNINGS++))
fi
echo ""

# Check 5: Logs directory
echo "5️⃣  Checking logs directory..."
if [ -d "server/logs" ]; then
  echo "   ✅ Logs directory exists: server/logs/"
  if [ -f "server/logs/error.log" ]; then
    ERROR_COUNT=$(wc -l < server/logs/error.log)
    echo "   📝 Recent errors: $ERROR_COUNT lines in error.log"
    if [ "$ERROR_COUNT" -gt 0 ]; then
      echo "   Last 5 errors:"
      tail -5 server/logs/error.log | sed 's/^/      /'
    fi
  fi
else
  echo "   ⚠️  Logs directory missing (will be auto-created on start)"
  ((WARNINGS++))
fi
echo ""

# Check 6: Environment variables in .mcp.json
echo "6️⃣  Checking environment variables..."
if grep -q "SUPABASE_URL" ../.mcp.json 2>/dev/null; then
  echo "   ✅ SUPABASE_URL found in .mcp.json"
else
  echo "   ⚠️  SUPABASE_URL missing (degraded mode)"
  ((WARNINGS++))
fi

if grep -q "ENCRYPTION_KEY" ../.mcp.json 2>/dev/null; then
  echo "   ✅ ENCRYPTION_KEY found in .mcp.json"
else
  echo "   ⚠️  ENCRYPTION_KEY missing (credential storage disabled)"
  ((WARNINGS++))
fi
echo ""

# Check 7: Health endpoint (if server is running)
echo "7️⃣  Checking if server is running..."
if curl -s http://localhost:9001/health > /dev/null 2>&1; then
  echo "   ✅ Server is running"
  echo "   Health response:"
  curl -s http://localhost:9001/health | python3 -m json.tool | sed 's/^/      /'
else
  echo "   ℹ️  Server not currently running (this is normal if Claude Code is closed)"
fi
echo ""

# Summary
echo "================================"
echo "📊 Summary"
echo "================================"
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo "✅ All checks passed! MCP should work correctly."
  echo ""
  echo "Next steps:"
  echo "1. Ensure 'assistant-mcp' is in enabledMcpjsonServers in ~/.claude.json"
  echo "2. Restart Claude Code"
  echo "3. Check logs: tail -f server/logs/combined.log"
elif [ "$ERRORS" -gt 0 ]; then
  echo "❌ Critical errors found. Fix errors above before starting."
  echo ""
  echo "Quick fixes:"
  echo "  cd server && npm install && npm run build"
else
  echo "⚠️  Some warnings found. Server will run in degraded mode."
  echo ""
  echo "Server will work but some features may be limited."
fi
