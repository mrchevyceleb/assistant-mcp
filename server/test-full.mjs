// Replicate what dist/index.js does but with stderr logging at each step
console.error('=== FULL SERVER TEST ===');
console.error('Step 1: Setting env vars...');
process.env.SUPABASE_URL = 'https://iycloielqcjnjqddeuet.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5Y2xvaWVscWNqbmpxZGRldWV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODk0MjM2OCwiZXhwIjoyMDg0NTE4MzY4fQ.OLKM6fFXeX1GO4NNEzGnxa7yDhRWf_YggX6_AP8rs4k';
process.env.ENCRYPTION_KEY = '797562d23cd9ba7bb992e9fe055fd148972f117d847e82d32c4bce6097b7dada';
process.env.NODE_ENV = 'production';

console.error('Step 2: Importing MCP SDK...');
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

console.error('Step 3: Importing express...');
import express from 'express';
import cors from 'cors';

console.error('Step 4: Importing zod-to-json-schema...');
import { zodToJsonSchema } from 'zod-to-json-schema';

console.error('Step 5: Importing supabase...');
import { initSupabase } from './dist/lib/supabase.js';

console.error('Step 6: Importing logger...');
import { logger } from './dist/lib/logger.js';

console.error('Step 7: Importing tools...');
import { metaTools } from './dist/tools/meta.js';
import { taskTools } from './dist/tools/tasks.js';
import { memoryTools } from './dist/tools/memory.js';
import { searchTools } from './dist/tools/search.js';
import { imageTools } from './dist/tools/images.js';
import { githubTools } from './dist/tools/github.js';
import { vercelTools } from './dist/tools/vercel.js';
import { hubspotTools } from './dist/tools/hubspot.js';
import { n8nTools } from './dist/tools/n8n.js';
import { calendarTools } from './dist/tools/calendar.js';

console.error('Step 8: Initializing Supabase...');
initSupabase();

console.error('Step 9: Combining tools...');
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
  ...calendarTools,
};
console.error('Total tools:', Object.keys(allTools).length);

console.error('Step 10: Creating MCP server...');
const server = new Server(
  { name: 'matt-assistant-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

console.error('Step 11: Setting up ListTools handler...');
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema, { target: 'jsonSchema7' }),
  }));
  return { tools };
});

console.error('Step 12: Creating transport...');
const transport = new StdioServerTransport();

console.error('Step 13: Connecting to transport...');
await server.connect(transport);

console.error('Step 14: MCP server connected!');
logger.info('MCP server started on stdio');
logger.info(`Registered ${Object.keys(allTools).length} tools`);

console.error('=== SERVER RUNNING ===');
