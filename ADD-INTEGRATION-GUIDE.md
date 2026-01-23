# How to Add New Integrations to assistant-mcp

Quick reference for adding new API integrations.

## Overview

To add a new integration (e.g., Slack):

1. Create tool file: `server/src/tools/slack.ts`
2. Register in: `server/src/index.ts` (add to `toolModules` array)
3. Store API key in Supabase
4. Restart Claude Code

Time: ~5-10 minutes per integration.

## Step 1: Create the Tool File

Create `server/src/tools/{service}.ts`:

```typescript
import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

// Helper to get API key
async function getApiKey(): Promise<string> {
  const key = await getCredential('slack'); // Use lowercase service name
  if (!key) {
    throw new Error('Slack API key not configured. Store it with service name "slack"');
  }
  return key;
}

// Export must be named {service}Tools (e.g., slackTools)
export const slackTools = {
  slack_list_channels: {
    description: 'List all Slack channels',
    inputSchema: z.object({
      limit: z.number().optional().default(100).describe('Max channels to return'),
    }),
    handler: async ({ limit = 100 }: { limit?: number }) => {
      const token = await getApiKey();
      
      const response = await fetch('https://slack.com/api/conversations.list', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }

      const data = await response.json() as any;
      
      if (!data.ok) {
        throw new Error(`Slack error: ${data.error}`);
      }

      return {
        channels: data.channels?.slice(0, limit) || [],
        count: Math.min(data.channels?.length || 0, limit),
      };
    },
  },

  slack_send_message: {
    description: 'Send a message to a Slack channel',
    inputSchema: z.object({
      channel: z.string().describe('Channel ID or name'),
      text: z.string().describe('Message text'),
    }),
    handler: async ({ channel, text }: { channel: string; text: string }) => {
      const token = await getApiKey();
      
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel, text }),
      });

      const data = await response.json() as any;
      
      if (!data.ok) {
        throw new Error(`Slack error: ${data.error}`);
      }

      return {
        success: true,
        message_ts: data.ts,
        channel: data.channel,
      };
    },
  },
};

// Register tools for discoverability (optional but recommended)
registerTool('slack_list_channels', 'slack', slackTools.slack_list_channels.description, slackTools.slack_list_channels.inputSchema);
registerTool('slack_send_message', 'slack', slackTools.slack_send_message.description, slackTools.slack_send_message.inputSchema);
```

## Step 2: Register in index.ts

Edit `server/src/index.ts` and add to the `toolModules` array:

```typescript
// Find this array (around line 48-60)
const toolModules = [
  { name: 'meta', path: './tools/meta.js' },
  { name: 'tasks', path: './tools/tasks.js' },
  { name: 'memory', path: './tools/memory.js' },
  { name: 'search', path: './tools/search.js' },
  { name: 'images', path: './tools/images.js' },
  { name: 'github', path: './tools/github.js' },
  { name: 'vercel', path: './tools/vercel.js' },
  { name: 'hubspot', path: './tools/hubspot.js' },
  { name: 'n8n', path: './tools/n8n.js' },
  { name: 'calendar', path: './tools/calendar.js' },
  { name: 'monday', path: './tools/monday.js' },
  { name: 'slack', path: './tools/slack.js' },  // <-- ADD THIS
];
```

**Important:** The `name` field is used to find the export. The loader looks for `{name}Tools` (e.g., `slackTools`).

## Step 3: Store API Key

Option A - Use the existing script:
```bash
cd server
npx tsx scripts/store-credentials.ts
```

Option B - Direct code (one-time):
```typescript
import { storeCredential } from './src/lib/encryption.js';
await storeCredential('slack', 'xoxb-your-slack-token');
```

Option C - Via Supabase dashboard:
Insert into `credentials` table (but encryption is complex - use Option A or B).

## Step 4: Restart Claude Code

Close and reopen Claude Code. The new tools will be available.

## Naming Conventions

- **Service name:** lowercase, single word (e.g., `slack`, `notion`, `linear`)
- **Tool names:** `{service}_{action}_{resource}` (e.g., `slack_send_message`, `notion_list_databases`)
- **Export name:** `{service}Tools` (e.g., `slackTools`)

## Common API Patterns

### Bearer Token (most common)
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
  'Authorization': `Basic ${Buffer.from(`${user}:${apiKey}`).toString('base64')}`,
}
```

### Query Parameter
```typescript
const url = `https://api.service.com/endpoint?api_key=${apiKey}`;
```

## Current Credentials (as of Jan 2026)

| Service | Description |
|---------|-------------|
| `brave_search` | Brave Search API |
| `perplexity` | Perplexity API |
| `gemini` | Google Gemini API |
| `github` | GitHub PAT |
| `vercel` | Vercel API Token |
| `hubspot` | HubSpot API Key |
| `monday` | Monday.com API Token |
| `n8n` | n8n API Key |

## Checklist

- [ ] Created `tools/{service}.ts` with export `{service}Tools`
- [ ] Added to `toolModules` array in `index.ts`
- [ ] Stored API key with `storeCredential('{service}', 'key')`
- [ ] Restarted Claude Code
- [ ] Tested tools with `list_capabilities` and actual usage

## Troubleshooting

### "Unknown tool" error
- Check the export name matches `{name}Tools` pattern
- Check the tool is in the `toolModules` array
- Check for TypeScript errors: `npm run build`

### "Credential not found" error
- Verify credential stored with exact service name
- Check Supabase `credentials` table has the entry

### Tools don't appear after changes
- Restart Claude Code (required for new files)
- Check server logs for loading errors
