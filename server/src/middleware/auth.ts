import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.MCP_AUTH_TOKEN;

  if (!expectedToken) {
    logger.error('MCP_AUTH_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Unauthorized request: missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);

  if (token !== expectedToken) {
    logger.warn('Unauthorized request: invalid token');
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  next();
}
