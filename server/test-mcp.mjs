console.error('Starting MCP test...');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

console.error('Creating server...');

const server = new Server(
  { name: 'test-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

console.error('Server created, setting up handler...');

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('ListTools called!');
  return { tools: [{ name: 'test_tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } }] };
});

console.error('Handler set, creating transport...');

const transport = new StdioServerTransport();

console.error('Transport created, connecting...');

await server.connect(transport);

console.error('Connected! MCP server is running.');
