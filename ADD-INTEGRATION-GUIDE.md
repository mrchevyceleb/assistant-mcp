# How to Add New Integrations to assistant-mcp

**Purpose:** Reference for Claude Code to add new API integrations quickly.

---

## Quick Summary

To add a new integration (e.g., Notion):

1. Create tool file: `assistant-mcp/server/src/tools/notion.ts`
2. Add import to: `assistant-mcp/server/src/index.ts`
3. Store API key in Supabase using the store-credentials script
4. Rebuild: `npm run build`

That's it. ~5 minutes per integration.

---

## Step-by-Step Process

### Step 1: Create the Tool File

Create `assistant-mcp/server/src/tools/{service}.ts`

Use this template:

```typescript
import { z } from 'zod';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// {SERVICE_NAME} Tools
// =============================================================================

// Helper to get API key
async function getApiKey(): Promise<string> {
  const key = await getCredential('{service_name}');
  if (!key) {
    throw new Error('{SERVICE_NAME} API key not configured. Store it with service name "{service_name}"');
  }
  return key;
}

// Tool definitions
export const {service}Tools = {
  // List/Get tool
  {service}_list_{resource}: {
    description: 'List all {resources} from {Service}',
    inputSchema: z.object({
      limit: z.number().optional().describe('Max results to return'),
    }),
    handler: async (args: { limit?: number }) => {
      const apiKey = await getApiKey();
      
      const response = await fetch('https://api.{service}.com/v1/{resources}', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`{Service} API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        {resources}: data.results || data,
        count: data.results?.length || data.length,
      };
    },
  },

  // Get single item tool
  {service}_get_{resource}: {
    description: 'Get a specific {resource} by ID',
    inputSchema: z.object({
      id: z.string().describe('The {resource} ID'),
    }),
    handler: async (args: { id: string }) => {
      const apiKey = await getApiKey();
      
      const response = await fetch(`https://api.{service}.com/v1/{resources}/${args.id}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`{Service} API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    },
  },

  // Create tool
  {service}_create_{resource}: {
    description: 'Create a new {resource}',
    inputSchema: z.object({
      name: z.string().describe('Name of the {resource}'),
      // Add other required fields
    }),
    handler: async (args: { name: string }) => {
      const apiKey = await getApiKey();
      
      const response = await fetch('https://api.{service}.com/v1/{resources}', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        throw new Error(`{Service} API error: ${response.status} ${response.statusText}`);
      }

      return {
        success: true,
        {resource}: await response.json(),
      };
    },
  },
};
```

### Step 2: Add Import to index.ts

Edit `assistant-mcp/server/src/index.ts`:

```typescript
// Find the imports section (around line 10-20)
import { {service}Tools } from './tools/{service}.js';

// Find where tools are registered (around line 80-100)
// Add to the allTools object:
const allTools = {
  ...metaTools,
  ...taskTools,
  ...memoryTools,
  ...searchTools,
  ...imageTools,
  ...githubTools,
  ...vercelTools,
  ...hubspotTools,
  ...n8nTools,
  ...{service}Tools,  // <-- ADD THIS LINE
};
```

### Step 3: Store the API Key

Option A - Use the script:
```bash
cd assistant-mcp/server
npx ts-node scripts/store-credentials.ts
# Then add the new service to the script first
```

Option B - Direct Supabase insert (easier for one-off):
```typescript
// Run this once in a temporary script or Node REPL
import { storeCredential } from './src/lib/encryption.js';
await storeCredential('{service_name}', 'your-api-key-here', { 
  description: '{Service} API key',
  addedBy: 'claude',
  addedDate: new Date().toISOString()
});
```

Option C - Ask Matt for the API key, then use the existing store-credentials.ts script (edit it to include the new service).

### Step 4: Rebuild

```bash
cd assistant-mcp/server
npm run build
```

### Step 5: Test

Restart OpenCode and test:
```
opencode mcp list  # Verify connected
# Then in chat: "List my {resources} from {Service}"
```

---

## File Locations Reference

```
assistant-mcp/
├── server/
│   ├── src/
│   │   ├── index.ts              # Main entry - ADD IMPORTS HERE
│   │   ├── tools/
│   │   │   ├── meta.ts           # help, list_capabilities, server_status
│   │   │   ├── tasks.ts          # Task management (8 tools)
│   │   │   ├── memory.ts         # Memory/persistence (4 tools)
│   │   │   ├── search.ts         # Brave, Perplexity (3 tools)
│   │   │   ├── images.ts         # Gemini image gen (2 tools)
│   │   │   ├── github.ts         # GitHub API (4 tools)
│   │   │   ├── vercel.ts         # Vercel deployments (3 tools)
│   │   │   ├── hubspot.ts        # HubSpot CRM (7 tools)
│   │   │   ├── n8n.ts            # n8n workflows (6 tools)
│   │   │   └── {new}.ts          # <-- NEW INTEGRATIONS GO HERE
│   │   ├── lib/
│   │   │   ├── encryption.ts     # getCredential(), storeCredential()
│   │   │   ├── supabase.ts       # Supabase client
│   │   │   └── logger.ts         # Logging utility
│   │   └── routes/
│   │       └── admin.ts          # Admin API (for future UI)
│   ├── scripts/
│   │   └── store-credentials.ts  # Bulk credential storage
│   ├── dist/                     # Compiled output (run npm run build)
│   └── package.json
├── admin-ui/                     # React admin dashboard (not deployed yet)
├── SETUP-BLUEPRINT.md            # Setup guide for other computers
├── OPENCODE-SETUP-GUIDE.md       # Detailed setup documentation
└── ADD-INTEGRATION-GUIDE.md      # THIS FILE
```

---

## Credentials Stored in Supabase

Current credentials (service names):
- `brave_search` - Brave Search API
- `perplexity` - Perplexity API  
- `gemini` - Google Gemini API
- `github` - GitHub Personal Access Token
- `vercel` - Vercel API Token
- `hubspot` - HubSpot API Key
- `n8n` - n8n API Key

To add a new one, use the exact service name in both:
1. `storeCredential('{service_name}', 'key')` 
2. `getCredential('{service_name}')` in your tool file

---

## Common API Patterns

### Bearer Token Auth (most common)
```typescript
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
}
```

### API Key Header
```typescript
headers: {
  'X-API-Key': apiKey,
  'Content-Type': 'application/json',
}
```

### Basic Auth
```typescript
headers: {
  'Authorization': `Basic ${Buffer.from(`${username}:${apiKey}`).toString('base64')}`,
  'Content-Type': 'application/json',
}
```

### Query Parameter
```typescript
const url = `https://api.service.com/endpoint?api_key=${apiKey}`;
```

---

## Example: Adding Notion Integration

1. **Create** `assistant-mcp/server/src/tools/notion.ts`:

```typescript
import { z } from 'zod';
import { getCredential } from '../lib/encryption.js';

async function getApiKey(): Promise<string> {
  const key = await getCredential('notion');
  if (!key) throw new Error('Notion API key not configured');
  return key;
}

export const notionTools = {
  notion_search: {
    description: 'Search Notion pages and databases',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
    }),
    handler: async (args: { query: string }) => {
      const apiKey = await getApiKey();
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: args.query }),
      });
      if (!response.ok) throw new Error(`Notion error: ${response.status}`);
      return await response.json();
    },
  },

  notion_list_databases: {
    description: 'List all Notion databases',
    inputSchema: z.object({}),
    handler: async () => {
      const apiKey = await getApiKey();
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filter: { property: 'object', value: 'database' } }),
      });
      if (!response.ok) throw new Error(`Notion error: ${response.status}`);
      return await response.json();
    },
  },
};
```

2. **Edit** `index.ts`:
```typescript
import { notionTools } from './tools/notion.js';
// ... 
const allTools = { ...existingTools, ...notionTools };
```

3. **Store credential**:
```bash
# Add to store-credentials.ts then run, OR use Supabase directly
```

4. **Build**:
```bash
npm run build
```

---

## Checklist for New Integration

- [ ] Created `tools/{service}.ts` with proper imports
- [ ] Added export to `index.ts`
- [ ] Stored API key in Supabase with correct service name
- [ ] Ran `npm run build`
- [ ] Tested with `opencode mcp list`
- [ ] Tested actual tool functionality

---

## Notes

- Tool names should be `{service}_{action}_{resource}` (e.g., `notion_list_databases`)
- Always use `getCredential()` - never hardcode API keys
- The `z` (Zod) schema defines what parameters the tool accepts
- Handler must return a JSON-serializable object
- Errors thrown in handlers are caught and returned to the AI gracefully
