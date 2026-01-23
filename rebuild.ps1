# Rebuild and restart assistant-mcp
# Run this after making changes to assistant-mcp source code

Write-Host "Rebuilding assistant-mcp..." -ForegroundColor Cyan

# Navigate to server directory
Push-Location "$PSScriptRoot\server"

# Run build
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild successful!" -ForegroundColor Green
    Write-Host "`nIMPORTANT: You must restart OpenCode for changes to take effect." -ForegroundColor Yellow
    Write-Host "The MCP server process caches modules in memory." -ForegroundColor Yellow
    Write-Host "`nTo restart OpenCode:" -ForegroundColor Cyan
    Write-Host "  1. Close OpenCode completely (Ctrl+C or close terminal)" -ForegroundColor White
    Write-Host "  2. Reopen OpenCode" -ForegroundColor White
} else {
    Write-Host "`nBuild failed! Check errors above." -ForegroundColor Red
}

Pop-Location
