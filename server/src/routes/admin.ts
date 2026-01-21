import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { encrypt, decrypt, storeCredential, getCredential } from '../lib/encryption.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Apply auth middleware to all admin routes
router.use(authMiddleware);

// =============================================================================
// Dashboard
// =============================================================================

/**
 * GET /admin/api/dashboard
 * Get overall dashboard data including health, stats, and recent activity
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // Get tool usage stats for last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [usageResult, credentialsResult, healthResult] = await Promise.all([
      supabase
        .from('tool_usage')
        .select('tool_name, success, execution_time_ms')
        .gte('timestamp', oneDayAgo),
      supabase.from('credentials').select('service, updated_at'),
      supabase.from('server_health').select('*').order('timestamp', { ascending: false }).limit(1),
    ]);

    const usage = usageResult.data || [];
    const credentials = credentialsResult.data || [];
    const lastHealth = healthResult.data?.[0];

    // Calculate stats
    const totalCalls = usage.length;
    const successfulCalls = usage.filter((u) => u.success).length;
    const avgExecutionTime =
      usage.length > 0
        ? Math.round(usage.reduce((sum, u) => sum + (u.execution_time_ms || 0), 0) / usage.length)
        : 0;

    // Group by tool
    const toolStats: Record<string, { calls: number; errors: number }> = {};
    for (const call of usage) {
      if (!toolStats[call.tool_name]) {
        toolStats[call.tool_name] = { calls: 0, errors: 0 };
      }
      toolStats[call.tool_name].calls++;
      if (!call.success) {
        toolStats[call.tool_name].errors++;
      }
    }

    res.json({
      health: {
        status: 'healthy',
        uptime: process.uptime(),
        lastCheck: lastHealth?.timestamp || new Date().toISOString(),
      },
      stats: {
        last24h: {
          totalCalls,
          successfulCalls,
          errorRate: totalCalls > 0 ? ((totalCalls - successfulCalls) / totalCalls) * 100 : 0,
          avgExecutionTime,
        },
        toolStats,
      },
      credentials: {
        count: credentials.length,
        services: credentials.map((c) => c.service),
      },
    });
  } catch (error: any) {
    logger.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// Credentials
// =============================================================================

/**
 * GET /admin/api/credentials
 * List all stored credentials (without revealing keys)
 */
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('credentials')
      .select('service, metadata, created_at, updated_at')
      .order('service');

    if (error) throw error;

    res.json({
      credentials: data || [],
    });
  } catch (error: any) {
    logger.error('List credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/api/credentials
 * Store a new credential
 */
router.post('/credentials', async (req: Request, res: Response) => {
  try {
    const { service, apiKey, metadata } = req.body;

    if (!service || !apiKey) {
      return res.status(400).json({ error: 'service and apiKey are required' });
    }

    await storeCredential(service, apiKey, metadata || {});

    res.json({
      success: true,
      message: `Credential stored for ${service}`,
    });
  } catch (error: any) {
    logger.error('Store credential error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/api/credentials/:service
 * Delete a credential
 */
router.delete('/credentials/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;

    const { error } = await supabase.from('credentials').delete().eq('service', service);

    if (error) throw error;

    res.json({
      success: true,
      message: `Credential deleted for ${service}`,
    });
  } catch (error: any) {
    logger.error('Delete credential error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/api/credentials/:service/test
 * Test if a credential is valid (by attempting to use it)
 */
router.post('/credentials/:service/test', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;

    // Get the credential
    const credential = await getCredential(service);

    // Basic validation - just check it exists and decrypts
    if (!credential || credential.length === 0) {
      return res.status(400).json({
        valid: false,
        error: 'Credential is empty',
      });
    }

    // Service-specific validation could be added here
    // For now, we just verify decryption worked
    res.json({
      valid: true,
      message: `Credential for ${service} is accessible`,
      keyLength: credential.length,
      keyPreview: credential.slice(0, 4) + '****' + credential.slice(-3),
    });
  } catch (error: any) {
    logger.error('Test credential error:', error);
    res.status(400).json({
      valid: false,
      error: error.message,
    });
  }
});

// =============================================================================
// Tools
// =============================================================================

/**
 * GET /admin/api/tools
 * List all available tools (imported from main server)
 */
router.get('/tools', async (req: Request, res: Response) => {
  try {
    // Import tool registry dynamically to get current state
    const [meta, tasks, memory, search, images, github, vercel] = await Promise.all([
      import('../tools/meta.js'),
      import('../tools/tasks.js'),
      import('../tools/memory.js'),
      import('../tools/search.js'),
      import('../tools/images.js'),
      import('../tools/github.js'),
      import('../tools/vercel.js'),
    ]);

    const allTools = {
      ...meta.metaTools,
      ...tasks.taskTools,
      ...memory.memoryTools,
      ...search.searchTools,
      ...images.imageTools,
      ...github.githubTools,
      ...vercel.vercelTools,
    };

    const tools = Object.entries(allTools).map(([name, tool]: [string, any]) => ({
      name,
      description: tool.description,
      category: getToolCategory(name),
      inputSchema: {
        required: Object.keys(tool.inputSchema.shape || {}).filter(
          (key) => !tool.inputSchema.shape[key]?.isOptional?.()
        ),
        properties: Object.keys(tool.inputSchema.shape || {}),
      },
    }));

    // Group by category
    const byCategory: Record<string, typeof tools> = {};
    for (const tool of tools) {
      if (!byCategory[tool.category]) {
        byCategory[tool.category] = [];
      }
      byCategory[tool.category].push(tool);
    }

    res.json({
      total: tools.length,
      categories: Object.keys(byCategory),
      tools,
      byCategory,
    });
  } catch (error: any) {
    logger.error('List tools error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/api/tools/:name/test
 * Test a specific tool (with optional arguments)
 */
router.post('/tools/:name/test', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { arguments: args } = req.body;

    // Import all tools
    const [meta, tasks, memory, search, images, github, vercel] = await Promise.all([
      import('../tools/meta.js'),
      import('../tools/tasks.js'),
      import('../tools/memory.js'),
      import('../tools/search.js'),
      import('../tools/images.js'),
      import('../tools/github.js'),
      import('../tools/vercel.js'),
    ]);

    const allTools: Record<string, any> = {
      ...meta.metaTools,
      ...tasks.taskTools,
      ...memory.memoryTools,
      ...search.searchTools,
      ...images.imageTools,
      ...github.githubTools,
      ...vercel.vercelTools,
    };

    const tool = allTools[name];
    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${name}` });
    }

    const startTime = Date.now();

    try {
      // Validate and execute
      const validatedArgs = tool.inputSchema.parse(args || {});
      const result = await tool.handler(validatedArgs);

      const executionTime = Date.now() - startTime;

      res.json({
        success: true,
        tool: name,
        executionTime,
        result,
      });
    } catch (execError: any) {
      const executionTime = Date.now() - startTime;

      res.status(400).json({
        success: false,
        tool: name,
        executionTime,
        error: execError.message,
      });
    }
  } catch (error: any) {
    logger.error('Test tool error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// Stats / Usage
// =============================================================================

/**
 * GET /admin/api/stats/usage
 * Get detailed usage statistics
 */
router.get('/stats/usage', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = Math.min(parseInt(days as string, 10) || 7, 30);
    const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('tool_usage')
      .select('*')
      .gte('timestamp', since)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    const usage = data || [];

    // Aggregate stats
    const byTool: Record<string, { calls: number; errors: number; totalTime: number }> = {};
    const byDay: Record<string, { calls: number; errors: number }> = {};
    const byCategory: Record<string, { calls: number; errors: number }> = {};

    for (const call of usage) {
      // By tool
      if (!byTool[call.tool_name]) {
        byTool[call.tool_name] = { calls: 0, errors: 0, totalTime: 0 };
      }
      byTool[call.tool_name].calls++;
      byTool[call.tool_name].totalTime += call.execution_time_ms || 0;
      if (!call.success) byTool[call.tool_name].errors++;

      // By day
      const day = call.timestamp.split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { calls: 0, errors: 0 };
      }
      byDay[day].calls++;
      if (!call.success) byDay[day].errors++;

      // By category
      const category = call.category || 'other';
      if (!byCategory[category]) {
        byCategory[category] = { calls: 0, errors: 0 };
      }
      byCategory[category].calls++;
      if (!call.success) byCategory[category].errors++;
    }

    res.json({
      period: {
        days: daysNum,
        since,
      },
      totals: {
        calls: usage.length,
        errors: usage.filter((u) => !u.success).length,
      },
      byTool,
      byDay,
      byCategory,
    });
  } catch (error: any) {
    logger.error('Usage stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function getToolCategory(toolName: string): string {
  if (
    toolName.startsWith('list_') ||
    toolName.startsWith('help') ||
    toolName.includes('status') ||
    toolName.includes('capabilities')
  ) {
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

export default router;
