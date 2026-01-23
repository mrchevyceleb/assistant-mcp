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
        const toolNames = Object.keys(imported[toolsKey]);
        allTools = { ...allTools, ...imported[toolsKey] };
        logger.info(`Loaded ${toolNames.length} tools from ${module.name}: ${toolNames.join(', ')}`);
      } else {
        logger.warn(`Module ${module.name} loaded but no ${toolsKey} export found`);
      }
    } catch (error: any) {
      // Degraded mode: Skip failed tools but continue
      logger.error(`FAILED to load ${module.name} tools: ${error.message}`);
      logger.error(`Stack trace for ${module.name}:`, error.stack);
    }
  }

  // Log all loaded tool names for verification
  const allToolNames = Object.keys(allTools);
  logger.info(`Total tools loaded: ${allToolNames.length}`);
  logger.info(`All tools: ${allToolNames.join(', ')}`);
  
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
const BASE_PORT = parseInt(process.env.PORT || '9001', 10);
const MAX_PORT_ATTEMPTS = 10;
let activePort: number | null = null;

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
    port: activePort,
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

// Try to start HTTP server on a port, with auto-retry on conflict
function tryListenOnPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(port);
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(null); // Port in use, try next
      } else {
        logger.error(`HTTP server error on port ${port}:`, err.message);
        resolve(null);
      }
    });
  });
}

async function startHttpServer(): Promise<void> {
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const port = BASE_PORT + attempt;
    logger.info(`Trying HTTP server on port ${port}...`);
    
    const result = await tryListenOnPort(port);
    if (result !== null) {
      activePort = result;
      logger.info(`✓ HTTP server listening on port ${activePort}`);
      logger.info(`  Health check: http://localhost:${activePort}/health`);
      logger.info(`  Admin UI: http://localhost:${activePort}/admin`);
      return;
    }
    
    logger.warn(`Port ${port} in use, trying next...`);
  }
  
  logger.warn(`Could not find available port after ${MAX_PORT_ATTEMPTS} attempts (tried ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1})`);
  logger.warn('MCP server continues running (HTTP admin UI disabled)');
}

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

    // Step 3.5: Verify critical tools are loaded
    const criticalTools = ['generate_image', 'edit_image', 'web_search', 'save_memory', 'list_capabilities'];
    const missingCritical = criticalTools.filter(t => !allTools[t]);
    if (missingCritical.length > 0) {
      logger.error(`CRITICAL TOOLS MISSING: ${missingCritical.join(', ')}`);
      logger.error('This indicates a module loading failure. Check tool exports.');
    } else {
      logger.info(`✓ All critical tools verified: ${criticalTools.join(', ')}`);
    }

    // Step 4: Start MCP server on stdio FIRST (critical for OpenCode to detect tools)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('✓ MCP server started on stdio');
    logger.info(`✓ Registered ${Object.keys(allTools).length} tools`);
    logger.info(`✓ Database: ${supabaseReady ? 'connected' : 'degraded mode (file-based fallback)'}`);

    // Step 5: Start HTTP server with auto-port retry (non-blocking, optional)
    await startHttpServer();

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
