import { Command } from 'commander';
import * as output from '../lib/output.js';
import { getServerUrl, getAuthToken } from '../lib/db.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check server health and status')
    .option('-v, --verbose', 'Show detailed status information')
    .action(async (options: { verbose?: boolean }) => {
      const spin = output.spinner('Checking server status...');

      try {
        const serverUrl = getServerUrl();
        const authToken = getAuthToken();

        // Call the health endpoint
        const response = await fetch(`${serverUrl}/health`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const health = await response.json();
        spin.stop();

        output.heading('Server Status');

        // Main status
        const statusColor = health.status === 'healthy' ? output.colors.success : output.colors.error;
        console.log(`  ${statusColor('●')} Status: ${health.status}`);
        output.keyValue('Server URL', serverUrl);
        output.keyValue('Uptime', formatUptime(health.uptime));

        if (options.verbose && health.checks) {
          console.log();
          output.heading('Health Checks');

          for (const [name, check] of Object.entries(health.checks as Record<string, { status: string; latency?: number }>)) {
            const checkStatus = check.status === 'ok' ? output.colors.success('✓') : output.colors.error('✗');
            const latency = check.latency ? output.colors.dim(` (${check.latency}ms)`) : '';
            console.log(`  ${checkStatus} ${name}${latency}`);
          }
        }

        if (options.verbose && health.tools) {
          console.log();
          output.keyValue('Total Tools', String(health.tools.total));
          output.keyValue('Categories', health.tools.categories?.join(', ') || '-');
        }

        console.log();

        if (health.status !== 'healthy') {
          output.warning('Server is not fully healthy');
          process.exit(1);
        }
      } catch (err) {
        spin.fail(`Failed to connect to server: ${(err as Error).message}`);
        output.info(`Make sure the server is running at ${getServerUrl()}`);
        process.exit(1);
      }
    });
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
}
