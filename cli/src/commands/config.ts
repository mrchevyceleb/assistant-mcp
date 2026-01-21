import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import * as output from '../lib/output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths
const PROJECT_MCP_CONFIG = resolve(__dirname, '../../../../.mcp.json');
const CLAUDE_CONFIG = join(homedir(), '.claude.json');

interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
}

interface McpJsonConfig {
  mcpServers?: Record<string, McpServer>;
}

interface ClaudeJsonConfig {
  projects?: Record<
    string,
    {
      enabledMcpjsonServers?: string[];
      disabledMcpServers?: string[];
      hasTrustDialogAccepted?: boolean;
    }
  >;
}

export function registerConfigCommand(program: Command): void {
  const config = program.command('config').description('Manage MCP server configuration');

  // mcp config list
  config
    .command('list')
    .description('List all configured MCP servers')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const spin = output.spinner('Loading configuration...');

      try {
        const mcpConfig = await loadMcpJson();
        const claudeConfig = await loadClaudeJson();
        spin.stop();

        const servers = mcpConfig.mcpServers || {};
        const serverNames = Object.keys(servers);

        if (serverNames.length === 0) {
          output.info('No MCP servers configured');
          output.info(`Add one with: ${output.colors.cyan('mcp config add <name>')}`);
          return;
        }

        // Get enabled list from claude.json
        const projectPath = getProjectPath();
        const projectConfig = claudeConfig.projects?.[projectPath];
        const enabledServers = projectConfig?.enabledMcpjsonServers || [];
        const disabledServers = projectConfig?.disabledMcpServers || [];

        if (options.json) {
          const result = serverNames.map((name) => ({
            name,
            enabled: enabledServers.includes(name) && !disabledServers.includes(name),
            config: servers[name],
          }));
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        output.heading('MCP Server Configuration');
        console.log();
        output.keyValue('Project config', PROJECT_MCP_CONFIG);
        output.keyValue('User config', CLAUDE_CONFIG);
        console.log();

        // Build table data
        const rows = serverNames.map((name) => {
          const server = servers[name];
          const isEnabled = enabledServers.includes(name) && !disabledServers.includes(name);
          const status = isEnabled
            ? output.colors.success('enabled')
            : output.colors.dim('disabled');

          let type = 'stdio';
          if (server.type === 'http' || server.url) {
            type = 'http';
          }

          let command = server.command || server.url || '-';
          if (command.length > 30) {
            command = command.slice(0, 27) + '...';
          }

          return [name, status, type, command];
        });

        output.table(['Name', 'Status', 'Type', 'Command/URL'], rows);
        console.log();
        output.info(`Total: ${serverNames.length} servers`);
      } catch (err) {
        spin.fail(`Failed to load config: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // mcp config add <name>
  config
    .command('add <name>')
    .description('Add a new MCP server')
    .option('-c, --command <cmd>', 'Command to run (e.g., npx)')
    .option('-a, --args <args>', 'Command arguments (comma-separated)')
    .option('-u, --url <url>', 'HTTP URL for HTTP-based MCP')
    .option('-e, --env <json>', 'Environment variables as JSON')
    .action(
      async (
        name: string,
        options: { command?: string; args?: string; url?: string; env?: string }
      ) => {
        try {
          const mcpConfig = await loadMcpJson();

          if (mcpConfig.mcpServers?.[name]) {
            output.error(`Server "${name}" already exists`);
            output.info(`Use ${output.colors.cyan(`mcp config remove ${name}`)} first`);
            process.exit(1);
          }

          let server: McpServer;

          // Interactive mode if no options provided
          if (!options.command && !options.url) {
            const answers = await inquirer.prompt([
              {
                type: 'list',
                name: 'type',
                message: 'Server type:',
                choices: [
                  { name: 'stdio (local command)', value: 'stdio' },
                  { name: 'HTTP (remote URL)', value: 'http' },
                ],
              },
              {
                type: 'input',
                name: 'command',
                message: 'Command (e.g., npx):',
                when: (a) => a.type === 'stdio',
                validate: (v) => (v ? true : 'Command is required'),
              },
              {
                type: 'input',
                name: 'args',
                message: 'Arguments (comma-separated, e.g., -y,@package/mcp):',
                when: (a) => a.type === 'stdio',
              },
              {
                type: 'input',
                name: 'url',
                message: 'HTTP URL:',
                when: (a) => a.type === 'http',
                validate: (v) => (v ? true : 'URL is required'),
              },
              {
                type: 'input',
                name: 'env',
                message: 'Environment variables (JSON, optional):',
              },
            ]);

            if (answers.type === 'http') {
              server = { type: 'http', url: answers.url, command: '' };
            } else {
              server = {
                command: answers.command,
                args: answers.args ? answers.args.split(',').map((a: string) => a.trim()) : undefined,
              };
            }

            if (answers.env) {
              try {
                server.env = JSON.parse(answers.env);
              } catch {
                output.warning('Invalid JSON for env, skipping');
              }
            }
          } else {
            // Non-interactive mode
            if (options.url) {
              server = { type: 'http', url: options.url, command: '' };
            } else if (options.command) {
              server = {
                command: options.command,
                args: options.args ? options.args.split(',').map((a) => a.trim()) : undefined,
              };
            } else {
              output.error('Either --command or --url is required');
              process.exit(1);
            }

            if (options.env) {
              try {
                server.env = JSON.parse(options.env);
              } catch {
                output.error('Invalid JSON for --env');
                process.exit(1);
              }
            }
          }

          // Add to .mcp.json
          mcpConfig.mcpServers = mcpConfig.mcpServers || {};
          mcpConfig.mcpServers[name] = server;
          await saveMcpJson(mcpConfig);

          output.success(`Added server "${name}" to .mcp.json`);

          // Ask to enable
          const { enable } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'enable',
              message: 'Enable this server on this machine?',
              default: true,
            },
          ]);

          if (enable) {
            await enableServer(name);
            output.success(`Enabled "${name}" on this machine`);
          }

          console.log();
          output.info('Restart Claude Code for changes to take effect');
        } catch (err) {
          output.error(`Failed to add server: ${(err as Error).message}`);
          process.exit(1);
        }
      }
    );

  // mcp config remove <name>
  config
    .command('remove <name>')
    .description('Remove an MCP server')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name: string, options: { force?: boolean }) => {
      try {
        const mcpConfig = await loadMcpJson();

        if (!mcpConfig.mcpServers?.[name]) {
          output.error(`Server "${name}" not found`);
          process.exit(1);
        }

        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Remove server "${name}"? This affects all machines.`,
              default: false,
            },
          ]);

          if (!confirm) {
            output.info('Cancelled');
            return;
          }
        }

        delete mcpConfig.mcpServers[name];
        await saveMcpJson(mcpConfig);

        output.success(`Removed server "${name}" from .mcp.json`);
        output.info('Restart Claude Code for changes to take effect');
      } catch (err) {
        output.error(`Failed to remove server: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // mcp config enable <name>
  config
    .command('enable <name>')
    .description('Enable an MCP server on this machine')
    .action(async (name: string) => {
      try {
        const mcpConfig = await loadMcpJson();

        if (!mcpConfig.mcpServers?.[name]) {
          output.error(`Server "${name}" not found in .mcp.json`);
          output.info(`Add it first with: ${output.colors.cyan(`mcp config add ${name}`)}`);
          process.exit(1);
        }

        await enableServer(name);
        output.success(`Enabled "${name}" on this machine`);
        output.info('Restart Claude Code for changes to take effect');
      } catch (err) {
        output.error(`Failed to enable server: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // mcp config disable <name>
  config
    .command('disable <name>')
    .description('Disable an MCP server on this machine')
    .action(async (name: string) => {
      try {
        await disableServer(name);
        output.success(`Disabled "${name}" on this machine`);
        output.info('Restart Claude Code for changes to take effect');
      } catch (err) {
        output.error(`Failed to disable server: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

// Helper functions

async function loadMcpJson(): Promise<McpJsonConfig> {
  if (!existsSync(PROJECT_MCP_CONFIG)) {
    return { mcpServers: {} };
  }
  const content = await readFile(PROJECT_MCP_CONFIG, 'utf-8');
  return JSON.parse(content);
}

async function saveMcpJson(config: McpJsonConfig): Promise<void> {
  await writeFile(PROJECT_MCP_CONFIG, JSON.stringify(config, null, 2) + '\n');
}

async function loadClaudeJson(): Promise<ClaudeJsonConfig> {
  if (!existsSync(CLAUDE_CONFIG)) {
    return { projects: {} };
  }
  const content = await readFile(CLAUDE_CONFIG, 'utf-8');
  return JSON.parse(content);
}

async function saveClaudeJson(config: ClaudeJsonConfig): Promise<void> {
  await writeFile(CLAUDE_CONFIG, JSON.stringify(config, null, 2) + '\n');
}

function getProjectPath(): string {
  // Get the Assistant project path for claude.json
  // This matches how Claude Code stores project configs
  const projectRoot = resolve(__dirname, '../../../..');
  // Claude uses forward slashes even on Windows for the key
  return projectRoot.replace(/\\/g, '/');
}

async function enableServer(name: string): Promise<void> {
  const claudeConfig = await loadClaudeJson();
  const projectPath = getProjectPath();

  claudeConfig.projects = claudeConfig.projects || {};
  claudeConfig.projects[projectPath] = claudeConfig.projects[projectPath] || {};

  const projectConfig = claudeConfig.projects[projectPath];

  // Add to enabled list
  projectConfig.enabledMcpjsonServers = projectConfig.enabledMcpjsonServers || [];
  if (!projectConfig.enabledMcpjsonServers.includes(name)) {
    projectConfig.enabledMcpjsonServers.push(name);
  }

  // Remove from disabled list
  if (projectConfig.disabledMcpServers) {
    projectConfig.disabledMcpServers = projectConfig.disabledMcpServers.filter((s) => s !== name);
  }

  // Ensure trust dialog is accepted
  projectConfig.hasTrustDialogAccepted = true;

  await saveClaudeJson(claudeConfig);
}

async function disableServer(name: string): Promise<void> {
  const claudeConfig = await loadClaudeJson();
  const projectPath = getProjectPath();

  claudeConfig.projects = claudeConfig.projects || {};
  claudeConfig.projects[projectPath] = claudeConfig.projects[projectPath] || {};

  const projectConfig = claudeConfig.projects[projectPath];

  // Remove from enabled list
  if (projectConfig.enabledMcpjsonServers) {
    projectConfig.enabledMcpjsonServers = projectConfig.enabledMcpjsonServers.filter(
      (s) => s !== name
    );
  }

  // Add to disabled list
  projectConfig.disabledMcpServers = projectConfig.disabledMcpServers || [];
  if (!projectConfig.disabledMcpServers.includes(name)) {
    projectConfig.disabledMcpServers.push(name);
  }

  await saveClaudeJson(claudeConfig);
}
