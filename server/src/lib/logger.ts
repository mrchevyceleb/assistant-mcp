import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory of this file for relative log paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '..', '..', 'logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// MCP servers use stdio for communication - console logging corrupts the protocol
// Only log to stderr (which MCP ignores) or files
const transports: winston.transport[] = [];

// Always add file transports
transports.push(
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
  })
);
transports.push(
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
  })
);

// In development, also log to stderr (not stdout!)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Stream({
      stream: process.stderr,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'assistant-mcp-server' },
  transports,
});

export async function logToolUsage(
  toolName: string,
  category: string,
  executionTimeMs: number,
  success: boolean,
  errorMessage?: string
) {
  try {
    // Dynamic import to avoid circular dependency
    const { supabase, supabaseReady } = await import('./supabase.js');

    // Skip if Supabase not ready (degraded mode)
    if (!supabaseReady) {
      logger.debug(`Tool usage not logged (DB unavailable): ${toolName}`);
      return;
    }

    const { error } = await supabase
      .from('tool_usage')
      .insert({
        tool_name: toolName,
        category,
        execution_time_ms: executionTimeMs,
        success,
        error_message: errorMessage,
      });

    if (error) {
      logger.error('Failed to log tool usage:', error);
    }
  } catch (err: any) {
    logger.error('Error in logToolUsage:', err.message);
  }
}
