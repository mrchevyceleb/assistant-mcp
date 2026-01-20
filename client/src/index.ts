#!/usr/bin/env node

import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine server path (assumes server is deployed alongside or accessible via npx)
const serverPath = process.env.MCP_SERVER_PATH || resolve(__dirname, '../../server/dist/index.js');

// Spawn the MCP server process
const server = spawn('node', [serverPath], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: {
    ...process.env,
    // Client can pass through auth token and server URL if needed
    MCP_AUTH_TOKEN: process.env.MCP_AUTH_TOKEN,
    MCP_SERVER_URL: process.env.MCP_SERVER_URL,
  },
});

server.on('error', (err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`MCP server exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Handle termination signals
process.on('SIGINT', () => {
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});
