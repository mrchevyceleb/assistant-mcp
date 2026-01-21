#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { initSupabase } from './lib/supabase.js';
import { logger, logToolUsage } from './lib/logger.js';
import { authMiddleware } from './middleware/auth.js';
import adminRouter from './routes/admin.js';

// Import all tools
import { metaTools } from './tools/meta.js';
import { taskTools } from './tools/tasks.js';
import { memoryTools } from './tools/memory.js';
import { searchTools } from './tools/search.js';
import { imageTools } from './tools/images.js';
import { githubTools } from './tools/github.js';
import { vercelTools } from './tools/vercel.js';
import { hubspotTools } from './tools/hubspot.js';
import { n8nTools } from './tools/n8n.js';

// Load environment variables
dotenv.config();

// Initialize Supabase
initSupabase();

// Combine all tools
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
};

// Create MCP server
const server = new Server(
  {
    name: 'matt-assistant-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema as any, { target: 'jsonSchema7' }),
  }));

  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();
  let success = true;
  let errorMessage: string | undefined;

  try {
    const tool = allTools[name as keyof typeof allTools];

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Validate input with Zod
    const validatedArgs = tool.inputSchema.parse(args);

    // Execute tool
    const result = await tool.handler(validatedArgs);

    const executionTime = Date.now() - startTime;

    // Log usage
    const category = getToolCategory(name);
    logToolUsage(name, category, executionTime, true);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    success = false;
    errorMessage = error.message;

    logger.error(`Tool execution error (${name}):`, error);

    const executionTime = Date.now() - startTime;
    const category = getToolCategory(name);
    logToolUsage(name, category, executionTime, false, errorMessage);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.message,
              tool: name,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Helper to get tool category from tool name
function getToolCategory(toolName: string): string {
  if (toolName.startsWith('list_') || toolName.startsWith('help') || toolName.includes('status') || toolName.includes('capabilities')) {
    return 'meta';
  }
  if (toolName.includes('task')) return 'tasks';
  if (toolName.includes('memory')) return 'memory';
  if (toolName.includes('search') || toolName.includes('research')) return 'search';
  if (toolName.includes('image')) return 'images';
  if (toolName.includes('issue') || toolName.includes('pr') || toolName.includes('repo')) return 'github';
  if (toolName.includes('deploy')) return 'deploy';
  return 'other';
}

// HTTP server for health check, admin API, and future OAuth endpoints
const app = express();
const PORT = process.env.PORT || 9001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    tools: {
      total: Object.keys(allTools).length,
      categories: ['meta', 'tasks', 'memory', 'search', 'images', 'github', 'deploy'],
    },
  });
});

// Tools listing endpoint (for CLI)
app.get('/tools', authMiddleware, (req, res) => {
  const tools = Object.entries(allTools).map(([name, tool]) => {
    const schema = tool.inputSchema as any;
    const shape = schema.shape || {};
    return {
      name,
      description: tool.description,
      category: getToolCategory(name),
      inputSchema: {
        required: Object.keys(shape).filter(
          (key) => !shape[key]?.isOptional?.()
        ),
        properties: Object.keys(shape),
      },
    };
  });

  res.json({ tools });
});

// Tool call endpoint (for CLI testing)
app.post('/tools/call', authMiddleware, async (req, res) => {
  const { name, arguments: args } = req.body;

  try {
    const tool = allTools[name as keyof typeof allTools];

    if (!tool) {
      return res.status(404).json({ error: `Unknown tool: ${name}` });
    }

    const validatedArgs = tool.inputSchema.parse(args || {});
    const result = await tool.handler(validatedArgs);

    res.json({
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    });
  } catch (error: any) {
    res.status(400).json({
      error: error.message,
      tool: name,
    });
  }
});

// Protected endpoint example (requires auth)
app.get('/api/status', authMiddleware, (req, res) => {
  res.json({
    status: 'authenticated',
    tools_count: Object.keys(allTools).length,
  });
});

// Admin API routes
app.use('/admin/api', adminRouter);

// Static files for admin UI (will be built into public/admin)
app.use('/admin', express.static('public/admin'));

// Future OAuth endpoints
// app.get('/auth/google', ...)
// app.get('/auth/google/callback', ...)

// Start both servers
async function main() {
  // Start HTTP server
  app.listen(PORT, () => {
    logger.info(`HTTP server listening on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
  });

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server started on stdio');
  logger.info(`Registered ${Object.keys(allTools).length} tools`);
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
