import { Command } from 'commander';
import inquirer from 'inquirer';
import {
  storeCredential,
  getCredential,
  listCredentials,
  deleteCredential,
} from '../lib/encryption.js';
import * as output from '../lib/output.js';

export function registerSecretCommand(program: Command): void {
  const secret = program.command('secret').description('Manage API credentials');

  // mcp secret set <service> [api_key]
  secret
    .command('set <service> [api_key]')
    .description('Store an encrypted credential')
    .option('-m, --metadata <json>', 'Optional metadata as JSON')
    .action(async (service: string, apiKey: string | undefined, options: { metadata?: string }) => {
      const spin = output.spinner(`Storing credential for ${service}...`);

      try {
        // If no API key provided, prompt for it
        let key = apiKey;
        if (!key) {
          spin.stop();
          const answers = await inquirer.prompt([
            {
              type: 'password',
              name: 'apiKey',
              message: `Enter API key for ${service}:`,
              mask: '*',
            },
          ]);
          key = answers.apiKey;
          spin.start();
        }

        if (!key) {
          spin.fail('API key is required');
          return;
        }

        // Parse metadata if provided
        let metadata: Record<string, unknown> | undefined;
        if (options.metadata) {
          try {
            metadata = JSON.parse(options.metadata);
          } catch {
            spin.fail('Invalid JSON for metadata');
            return;
          }
        }

        await storeCredential(service, key, metadata);
        spin.succeed(`Credential stored for ${output.colors.cyan(service)}`);
      } catch (err) {
        spin.fail(`Failed to store credential: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // mcp secret get <service>
  secret
    .command('get <service>')
    .description('Retrieve a credential (masked output)')
    .option('-r, --reveal', 'Show full credential (use with caution)')
    .action(async (service: string, options: { reveal?: boolean }) => {
      const spin = output.spinner(`Retrieving credential for ${service}...`);

      try {
        const credential = await getCredential(service);
        spin.stop();

        output.heading(`Credential: ${service}`);
        if (options.reveal) {
          output.warning('Revealing full credential - do not share!');
          output.keyValue('API Key', credential);
        } else {
          output.keyValue('API Key', output.maskKey(credential));
        }
        console.log();
      } catch (err) {
        spin.fail(`Failed to retrieve credential: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // mcp secret list
  secret
    .command('list')
    .description('List all stored credentials')
    .action(async () => {
      const spin = output.spinner('Loading credentials...');

      try {
        const credentials = await listCredentials();
        spin.stop();

        if (credentials.length === 0) {
          output.info('No credentials stored yet');
          return;
        }

        output.heading('Stored Credentials');
        output.table(
          ['Service', 'Updated', 'Metadata'],
          credentials.map(c => [
            c.service,
            output.formatDate(c.updated_at),
            Object.keys(c.metadata || {}).length > 0 ? 'Yes' : '-',
          ])
        );
        console.log();
        output.info(`Total: ${credentials.length} credentials`);
      } catch (err) {
        spin.fail(`Failed to list credentials: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // mcp secret delete <service>
  secret
    .command('delete <service>')
    .description('Delete a credential')
    .option('-f, --force', 'Skip confirmation')
    .action(async (service: string, options: { force?: boolean }) => {
      try {
        // Confirm unless --force
        if (!options.force) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete the credential for "${service}"?`,
              default: false,
            },
          ]);

          if (!answers.confirm) {
            output.info('Cancelled');
            return;
          }
        }

        const spin = output.spinner(`Deleting credential for ${service}...`);
        await deleteCredential(service);
        spin.succeed(`Credential deleted for ${output.colors.cyan(service)}`);
      } catch (err) {
        output.error(`Failed to delete credential: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
