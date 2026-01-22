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
import { initSupabase, supabaseReady } from './lib/supabase.js';
import { logger, logToolUsage } from './lib/logger.js';
import { authMiddleware } from './middleware/auth.js';
import adminRouter from './routes/admin.js';

// Load environment variables FIRST
dotenv.config();

// Startup validation
function validateEnvironment() {
  const warnings: string[] = [];
  const critical: string[] = [];

  // Check Supabase (not critical - can run in degraded mode)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    warnings.push('SUPABASE_URL or SUPABASE_SERVICE_KEY missing - tasks/memory tools will be disabled');
  }

  // Check encryption key (not critical if no sensitive tools used)
  if (!process.env.ENCRYPTION_KEY) {
    warnings.push('ENCRYPTION_KEY missing - credential storage disabled');
  }

  // Check auth token (not critical for stdio MCP)
  if (!process.env.MCP_AUTH_TOKEN) {
    warnings.push('MCP_AUTH_TOKEN missing - admin API access disabled');
  }

  return { warnings, critical };
}

// Import tools with error handling
let allTools: Record<string, any> = {};

async function loadTools() {
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
  ];

  for (const module of toolModules) {
    try {
      const imported = await import(module.path);
      const toolsKey = `${module.name}Tools`;
      if (imported[toolsKey]) {
        allTools = { ...allTools, ...imported[toolsKey] };
        logger.info(`Loaded ${Object.keys(imported[toolsKey]).length} tools from ${module.name}`);
      }
    } catch (error: any) {
      // Degraded mode: Skip failed tools but continue
      logger.warn(`Failed to load ${module.name} tools:`, error.message);
      logger.debug(`Stack trace for ${module.name}:`, error.stack);
    }
  }

  logger.info(`Total tools loaded: ${Object.keys(allTools).length}`);
  
  if (Object.keys(allTools).length === 0) {
    logger.error('CRITICAL: No tools loaded - MCP server cannot function');
    throw new Error('No tools loaded');
  }
}

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
  try {
    const tools = Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema as any, { target: 'jsonSchema7' }),
    }));

    return { tools };
  } catch (error: any) {
    logger.error('Error listing tools:', error);
    return { tools: [] };
  }
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

    // Log usage (non-blocking, skips if DB unavailable)
    const category = getToolCategory(name);
    logToolUsage(name, category, executionTime, true).catch(() => {});

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
    logToolUsage(name, category, executionTime, false, errorMessage).catch(() => {});

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
    database: supabaseReady ? 'connected' : 'degraded',
    tools: {
      total: Object.keys(allTools).length,
      categories: ['meta', 'tasks', 'memory', 'search', 'images', 'github', 'deploy'],
    },
  });
});

// Tools listing endpoint (for CLI)
app.get('/tools', authMiddleware, (req, res) => {
  try {
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
  } catch (error: any) {
    logger.error('Error listing tools via API:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
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
    database: supabaseReady ? 'connected' : 'degraded',
  });
});

// Admin API routes
app.use('/admin/api', adminRouter);

// Static files for admin UI (will be built into public/admin)
app.use('/admin', express.static('public/admin'));

// Start both servers
async function main() {
  try {
    // Step 1: Validate environment
    logger.info('Starting Matt\'s Assistant MCP Server...');
    const { warnings, critical } = validateEnvironment();
    
    if (warnings.length > 0) {
      logger.warn('Environment warnings:');
      warnings.forEach(w => logger.warn(`  - ${w}`));
    }

    if (critical.length > 0) {
      logger.error('Critical environment errors:');
      critical.forEach(c => logger.error(`  - ${c}`));
      throw new Error('Critical environment variables missing');
    }

    // Step 2: Initialize Supabase (non-blocking, can fail)
    logger.info('Initializing Supabase...');
    await initSupabase();

    // Step 3: Load tools (critical - must succeed)
    logger.info('Loading tools...');
    await loadTools();

    // Step 4: Start MCP server on stdio FIRST (critical for OpenCode to detect tools)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('✓ MCP server started on stdio');
    logger.info(`✓ Registered ${Object.keys(allTools).length} tools`);
    logger.info(`✓ Database: ${supabaseReady ? 'connected' : 'degraded mode (file-based fallback)'}`);

    // Step 5: Start HTTP server AFTER MCP is ready (non-blocking, optional)
    app.listen(PORT, () => {
      logger.info(`✓ HTTP server listening on port ${PORT}`);
      logger.info(`  Health check: http://localhost:${PORT}/health`);
      logger.info(`  Admin UI: http://localhost:${PORT}/admin`);
    }).on('error', (err: any) => {
      logger.warn(`HTTP server failed to start: ${err.message}`);
      logger.warn('MCP server continues running (HTTP admin UI disabled)');
    });

  } catch (error: any) {
    logger.error('Fatal startup error:', error);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Fatal error in main():', error);
  process.exit(1);
});
