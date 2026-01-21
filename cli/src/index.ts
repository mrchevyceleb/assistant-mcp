#!/usr/bin/env node

import { Command } from 'commander';
import { registerSecretCommand } from './commands/secret.js';
import { registerStatusCommand } from './commands/status.js';
import { registerToolsCommand } from './commands/tools.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('mcp')
  .description('CLI tool for managing assistant-mcp server')
  .version('1.0.0');

// Register all commands
registerSecretCommand(program);
registerStatusCommand(program);
registerToolsCommand(program);
registerConfigCommand(program);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
