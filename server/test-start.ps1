$env:SUPABASE_URL = "https://iycloielqcjnjqddeuet.supabase.co"
$env:SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5Y2xvaWVscWNqbmpxZGRldWV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODk0MjM2OCwiZXhwIjoyMDg0NTE4MzY4fQ.OLKM6fFXeX1GO4NNEzGnxa7yDhRWf_YggX6_AP8rs4k"
$env:ENCRYPTION_KEY = "797562d23cd9ba7bb992e9fe055fd148972f117d847e82d32c4bce6097b7dada"
$env:NODE_ENV = "production"
$env:PORT = "9001"

Write-Host "Starting assistant-mcp server..."
node "C:/Users/mtjoh/OneDrive/Documents/ASSISTANT-HUB/Assistant/assistant-mcp/server/dist/index.js"
