import { Command } from 'commander';
import * as output from '../lib/output.js';
import { getServerUrl, getAuthToken } from '../lib/db.js';

interface Tool {
  name: string;
  description: string;
  category: string;
  inputSchema?: {
    required?: string[];
    properties?: Record<string, unknown>;
  };
}

export function registerToolsCommand(program: Command): void {
  program
    .command('tools')
    .description('List and test available tools')
    .option('-c, --category <category>', 'Filter by category')
    .option('-t, --test <name>', 'Test a specific tool')
    .option('--json', 'Output as JSON')
    .action(async (options: { category?: string; test?: string; json?: boolean }) => {
      const spin = output.spinner('Loading tools...');

      try {
        const serverUrl = getServerUrl();
        const authToken = getAuthToken();

        // If testing a specific tool
        if (options.test) {
          spin.text = `Testing tool: ${options.test}...`;
          await testTool(serverUrl, authToken, options.test, spin);
          return;
        }

        // List tools
        const response = await fetch(`${serverUrl}/tools`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const tools: Tool[] = data.tools || [];
        spin.stop();

        // Filter by category if specified
        let filteredTools = tools;
        if (options.category) {
          filteredTools = tools.filter(
            (t) => t.category?.toLowerCase() === options.category?.toLowerCase()
          );
        }

        if (options.json) {
          console.log(JSON.stringify(filteredTools, null, 2));
          return;
        }

        if (filteredTools.length === 0) {
          output.info(options.category ? `No tools found in category: ${options.category}` : 'No tools available');
          return;
        }

        // Group by category
        const byCategory = groupByCategory(filteredTools);

        output.heading('Available Tools');
        console.log();

        for (const [category, categoryTools] of Object.entries(byCategory)) {
          console.log(output.colors.bold(output.colors.cyan(`  ${category}`)));
          console.log(output.colors.dim('  ' + '─'.repeat(38)));

          for (const tool of categoryTools) {
            const required = tool.inputSchema?.required?.length || 0;
            const optional =
              Object.keys(tool.inputSchema?.properties || {}).length - required;
            const params = [];
            if (required > 0) params.push(`${required} required`);
            if (optional > 0) params.push(`${optional} optional`);

            console.log(`    ${output.colors.bold(tool.name)}`);
            console.log(`    ${output.colors.dim(truncate(tool.description, 60))}`);
            if (params.length > 0) {
              console.log(`    ${output.colors.dim('Params: ' + params.join(', '))}`);
            }
            console.log();
          }
        }

        // Summary
        const categories = Object.keys(byCategory);
        output.info(`Total: ${filteredTools.length} tools across ${categories.length} categories`);
        console.log();
        output.info(`Test a tool: ${output.colors.cyan('mcp tools --test <name>')}`);
      } catch (err) {
        spin.fail(`Failed to load tools: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

async function testTool(
  serverUrl: string,
  authToken: string,
  toolName: string,
  spin: ReturnType<typeof output.spinner>
): Promise<void> {
  try {
    // First, get the tool definition
    const listResponse = await fetch(`${serverUrl}/tools`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to fetch tools: ${listResponse.statusText}`);
    }

    const data = await listResponse.json();
    const tools: Tool[] = data.tools || [];
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      spin.fail(`Tool not found: ${toolName}`);
      output.info('Use "mcp tools" to see available tools');
      process.exit(1);
    }

    // Test the tool with minimal/empty args
    const testResponse = await fetch(`${serverUrl}/tools/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: toolName,
        arguments: {},
      }),
    });

    spin.stop();

    output.heading(`Tool Test: ${toolName}`);
    output.keyValue('Category', tool.category || 'uncategorized');
    output.keyValue('Description', tool.description);
    console.log();

    if (testResponse.ok) {
      const result = await testResponse.json();
      output.success('Tool executed successfully');
      console.log();
      output.heading('Response');

      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === 'text') {
            // Pretty print if JSON
            try {
              const parsed = JSON.parse(item.text);
              console.log(JSON.stringify(parsed, null, 2));
            } catch {
              console.log(item.text);
            }
          }
        }
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      const error = await testResponse.json().catch(() => ({ error: testResponse.statusText }));
      output.warning('Tool returned an error (this may be expected for tools requiring arguments)');
      console.log();
      output.keyValue('Status', String(testResponse.status));
      output.keyValue('Error', error.error || error.message || 'Unknown error');

      // Show required arguments
      if (tool.inputSchema?.required && tool.inputSchema.required.length > 0) {
        console.log();
        output.info('This tool requires the following arguments:');
        for (const arg of tool.inputSchema.required) {
          console.log(`  - ${arg}`);
        }
      }
    }
  } catch (err) {
    spin.fail(`Failed to test tool: ${(err as Error).message}`);
    process.exit(1);
  }
}

function groupByCategory(tools: Tool[]): Record<string, Tool[]> {
  const groups: Record<string, Tool[]> = {};

  for (const tool of tools) {
    const category = tool.category || 'Other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(tool);
  }

  // Sort categories and tools within each category
  const sorted: Record<string, Tool[]> = {};
  for (const category of Object.keys(groups).sort()) {
    sorted[category] = groups[category].sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}
