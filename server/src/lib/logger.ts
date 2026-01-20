import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'assistant-mcp-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}

export function logToolUsage(
  toolName: string,
  category: string,
  executionTimeMs: number,
  success: boolean,
  errorMessage?: string
) {
  const { supabase } = require('./supabase.js');

  supabase
    .from('tool_usage')
    .insert({
      tool_name: toolName,
      category,
      execution_time_ms: executionTimeMs,
      success,
      error_message: errorMessage,
    })
    .then(({ error }: any) => {
      if (error) {
        logger.error('Failed to log tool usage:', error);
      }
    });
}
