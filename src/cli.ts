#!/usr/bin/env node
import { readFile, access, constants } from 'fs/promises';
import { createRequire } from 'module';

import { Command } from 'commander';
import { parse as parseYaml } from 'yaml';

import { ServersGuruClient } from './api/servers-guru.js';
import { DeploymentConfigSchema, type DeploymentConfig, type DeploymentStep } from './config.js';
import { DeploymentOrchestrator } from './orchestrator.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

/**
 * Load configuration from file
 */
async function loadConfig(configPath: string): Promise<DeploymentConfig> {
  try {
    await access(configPath, constants.R_OK);
  } catch {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const content = await readFile(configPath, 'utf-8');

  let rawConfig: unknown;
  if (configPath.endsWith('.json')) {
    rawConfig = JSON.parse(content);
  } else {
    rawConfig = parseYaml(content);
  }

  // Apply environment variable overrides
  const configWithEnv = applyEnvOverrides(rawConfig as Record<string, unknown>);

  const result = DeploymentConfigSchema.safeParse(configWithEnv);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`);
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
}

/**
 * Recursively substitute ${VAR} patterns with environment variables
 */
function substituteEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    // Replace ${VAR} patterns with environment variable values
    return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
      const envValue = process.env[varName];
      if (envValue !== undefined) {
        return envValue;
      }
      // Return original if env var not set (will cause validation error if required)
      return match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteEnvVars(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = substituteEnvVars(val);
    }
    return result;
  }

  return value;
}

/**
 * Apply environment variable overrides to config
 */
function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  // First, substitute all ${VAR} patterns in the config
  const substituted = substituteEnvVars(config) as Record<string, unknown>;

  // Then apply specific environment variable overrides (for backwards compatibility)
  const apiKey = process.env.SERVERSGURU_API_KEY;
  if (typeof apiKey === 'string' && apiKey !== '') {
    const serversGuru = (substituted.serversGuru as Record<string, unknown>) ?? {};
    substituted.serversGuru = {
      ...serversGuru,
      apiKey,
    };
  }

  // Override registry auth from environment
  const registryUser = process.env.DOCKER_REGISTRY_USERNAME;
  const registryPass = process.env.DOCKER_REGISTRY_PASSWORD;
  if (
    typeof registryUser === 'string' &&
    registryUser !== '' &&
    typeof registryPass === 'string' &&
    registryPass !== ''
  ) {
    const app = (substituted.app as Record<string, unknown>) ?? {};
    substituted.app = {
      ...app,
      registryAuth: {
        username: registryUser,
        password: registryPass,
        registry: process.env.DOCKER_REGISTRY ?? 'ghcr.io',
      },
    };
  }

  return substituted;
}

/**
 * Format step name for display
 */
function formatStep(step: DeploymentStep): string {
  const icons: Record<DeploymentStep, string> = {
    'check-balance': '[1/10]',
    'order-vps': '[2/10]',
    'wait-provisioning': '[3/10]',
    'wait-ssh': '[4/10]',
    'setup-server': '[5/10]',
    'deploy-application': '[6/10]',
    'configure-nginx': '[7/10]',
    'obtain-ssl': '[8/10]',
    'health-check': '[9/10]',
    'create-snapshot': '[10/10]',
    complete: '[DONE]',
  };
  return icons[step] || '[...]';
}

/**
 * Progress callback for CLI output
 */
function progressCallback(step: DeploymentStep, message: string): void {
  console.log(`${formatStep(step)} ${message}`);
}

// CLI Program
program
  .name('sg-deploy')
  .description('Autonomous VPS deployment using Servers.guru API')
  .version(version);

// Deploy command
program
  .command('deploy')
  .description('Deploy application to a new or existing VPS')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .option('--server-id <id>', 'Deploy to existing server by ID')
  .option('--server-ip <ip>', 'Server IP address (required with --server-id)')
  .option('--password <password>', 'Server password (required with --server-id)')
  .option('--dry-run', 'Validate configuration without deploying')
  .action(
    async (options: {
      config: string;
      serverId?: string;
      serverIp?: string;
      password?: string;
      dryRun?: boolean;
    }) => {
      try {
        console.log('Loading configuration...');
        const config = await loadConfig(options.config);

        if (options.dryRun === true) {
          console.log('Configuration validated successfully');
          console.log('\nDeployment summary:');
          console.log(`  VPS Type: ${config.vps.type}`);
          console.log(`  OS Image: ${config.vps.osImage}`);
          console.log(`  App: ${config.app.name}`);
          console.log(`  Docker Image: ${config.app.dockerImage}`);
          if (config.domain) {
            console.log(`  Domain: ${config.domain.name}`);
          }
          return;
        }

        const orchestrator = new DeploymentOrchestrator(config);
        orchestrator.setProgressCallback(progressCallback);

        let result;
        if (typeof options.serverId === 'string' && options.serverId !== '') {
          if (
            typeof options.serverIp !== 'string' ||
            options.serverIp === '' ||
            typeof options.password !== 'string' ||
            options.password === ''
          ) {
            throw new Error('--server-ip and --password are required when using --server-id');
          }
          console.log(`Deploying to existing server ${options.serverId}...`);
          result = await orchestrator.deployToExisting(
            parseInt(options.serverId, 10),
            options.serverIp,
            options.password
          );
        } else {
          console.log('Starting new deployment...\n');
          result = await orchestrator.deploy();
        }

        console.log(`\n${'='.repeat(50)}`);
        if (result.success) {
          console.log('DEPLOYMENT SUCCESSFUL');
          console.log('='.repeat(50));
          console.log(`Server ID: ${result.serverId}`);
          console.log(`Server IP: ${result.serverIp}`);
          console.log(`App URL: ${result.appUrl}`);
          if (typeof result.snapshotId === 'number' && result.snapshotId > 0) {
            console.log(`Snapshot ID: ${result.snapshotId}`);
          }
          console.log(`Health Check: ${result.healthCheckPassed === true ? 'PASSED' : 'FAILED'}`);
        } else {
          console.log('DEPLOYMENT FAILED');
          console.log('='.repeat(50));
          console.log('\nErrors:');
          result.errors.forEach((e) => console.log(`  - ${e}`));
          process.exit(1);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

// Status command
program
  .command('status')
  .description('Check server status')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID to check')
  .action(async (options: { config: string; serverId: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Checking status of server ${options.serverId}...`);
      const status = await client.getServerStatus(parseInt(options.serverId, 10));
      const server = await client.getServer(parseInt(options.serverId, 10));

      console.log('\nServer Information:');
      console.log(`  Name: ${server.name}`);
      console.log(`  IPv4: ${server.ipv4}`);
      console.log(`  Status: ${status.status}`);
      console.log(`  OS: ${server.osImage}`);
      console.log(`  Type: ${server.vpsType}`);
      console.log(`  Datacenter: ${server.datacenter}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// List servers command
program
  .command('list')
  .description('List all servers')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .option('--search <query>', 'Search filter')
  .action(async (options: { config: string; search?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log('Fetching servers...\n');
      // Fix unsafe assignment
      const servers = await client.listServers({ search: options.search });

      if (servers.length === 0) {
        console.log('No servers found');
        return;
      }

      console.log('ID\tName\t\tIPv4\t\t\tStatus');
      console.log('-'.repeat(60));
      for (const server of servers) {
        console.log(`${server.id}\t${server.name}\t${server.ipv4}\t\t${server.status}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Products command
program
  .command('products')
  .description('List available VPS products')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .option('--arch <arch>', 'Filter by architecture (x86, arm64)')
  .option('--location <loc>', 'Filter by location code (NL, FI, MTL, etc.)')
  .option('--max-price <price>', 'Filter by max monthly price')
  .option('--json', 'Output as JSON')
  .action(
    async (options: {
      config: string;
      arch?: string;
      location?: string;
      maxPrice?: string;
      json?: boolean;
    }) => {
      try {
        const config = await loadConfig(options.config);
        const client = new ServersGuruClient(config.serversGuru);

        console.log('Fetching available products...\n');
        let products = await client.getProducts();

        // Apply filters
        products = products.filter((p) => {
          if (!p.available) {
            return false;
          }
          if (
            typeof options.arch === 'string' &&
            options.arch !== '' &&
            p.arch.toLowerCase() !== options.arch.toLowerCase()
          ) {
            return false;
          }
          if (
            typeof options.location === 'string' &&
            options.location !== '' &&
            !p.id.toUpperCase().startsWith(options.location.toUpperCase())
          ) {
            return false;
          }
          if (
            typeof options.maxPrice === 'string' &&
            options.maxPrice !== '' &&
            p.price.monthly > parseFloat(options.maxPrice)
          ) {
            return false;
          }
          return true;
        });

        if (products.length === 0) {
          console.log('No products found matching filters');
          return;
        }

        if (options.json === true) {
          console.log(JSON.stringify(products, null, 2));
          return;
        }

        // Sort by price
        products.sort((a, b) => a.price.monthly - b.price.monthly);

        console.log('ID\t\tArch\tCPU\tRAM\tDisk\tPrice/mo\tCPU Model');
        console.log('-'.repeat(90));
        for (const product of products) {
          const cpuModel =
            product.cpuModel.length > 25 ? `${product.cpuModel.slice(0, 25)}...` : product.cpuModel;
          console.log(
            `${product.id}\t\t${product.arch}\t${product.cpu}\t${product.ram}GB\t${product.disk}GB\t$${product.price.monthly}\t\t${cpuModel}`
          );
        }
        console.log(`\nTotal: ${products.length} products`);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

// Images command
program
  .command('images')
  .description('List available OS images')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .action(async (options: { config: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log('Fetching available OS images...\n');
      const images = await client.getImages();

      console.log('Available OS Images:');
      for (const image of images) {
        console.log(`  - ${image}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Rollback command
program
  .command('rollback')
  .description('Rollback server to a snapshot')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .requiredOption('--snapshot-id <id>', 'Snapshot ID to restore')
  .action(async (options: { config: string; serverId: string; snapshotId: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Rolling back server ${options.serverId} to snapshot ${options.snapshotId}...`);

      await client.restoreSnapshot(
        parseInt(options.serverId, 10),
        parseInt(options.snapshotId, 10)
      );

      console.log('Rollback initiated. Waiting for server to come back online...');

      await client.waitForStatus(parseInt(options.serverId, 10), 'running', {
        timeout: 300000,
        onProgress: (status) => console.log(`  Status: ${status}`),
      });

      console.log('Rollback complete!');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Snapshots command
program
  .command('snapshots')
  .description('List server snapshots')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .action(async (options: { config: string; serverId: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Fetching snapshots for server ${options.serverId}...\n`);
      const snapshots = await client.listSnapshots(parseInt(options.serverId, 10));

      if (snapshots.length === 0) {
        console.log('No snapshots found');
        return;
      }

      console.log('ID\tName\t\t\tCreated\t\t\tSize');
      console.log('-'.repeat(70));
      for (const snapshot of snapshots) {
        console.log(`${snapshot.id}\t${snapshot.name}\t${snapshot.createdAt}\t${snapshot.size}GB`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Power command
program
  .command('power')
  .description('Power control for server')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .requiredOption('--action <action>', 'Power action: start, shutdown, reboot')
  .action(async (options: { config: string; serverId: string; action: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      const action = options.action as 'start' | 'shutdown' | 'reboot';
      if (!['start', 'shutdown', 'reboot'].includes(action)) {
        throw new Error('Invalid action. Use: start, shutdown, or reboot');
      }

      console.log(`Sending ${action} command to server ${options.serverId}...`);
      await client.powerAction(parseInt(options.serverId, 10), action);
      console.log('Command sent successfully');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Balance command
program
  .command('balance')
  .description('Check account balance')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .action(async (options: { config: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      const balance = await client.getBalance();
      console.log(`Account balance: $${balance.toFixed(2)}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Init command - create example config
program
  .command('init')
  .description('Create example configuration file')
  .option('-o, --output <path>', 'Output file path', 'deploy.yaml')
  .action(async (options: { output: string }) => {
    const exampleConfig = `# Servers.guru Deployment Configuration
# See: https://my.servers.guru/api

serversGuru:
  apiKey: "\${SERVERSGURU_API_KEY}"  # Use env var for security
  baseUrl: https://my.servers.guru/api

vps:
  type: "NL1-2"              # VPS product type (use 'sg-deploy products' to list)
  osImage: "ubuntu-22.04"    # OS image (use 'sg-deploy images' to list)
  billingCycle: 1            # Months (1-12)
  hostname: "my-app"         # Optional hostname

ssh:
  port: 22
  username: root
  connectionTimeout: 30000   # 30 seconds
  commandTimeout: 300000     # 5 minutes

app:
  name: "my-app"
  dockerImage: "ghcr.io/user/my-app:latest"
  registryAuth:              # Optional - for private registries
    username: "\${DOCKER_REGISTRY_USERNAME}"
    password: "\${DOCKER_REGISTRY_PASSWORD}"
    registry: ghcr.io
  envVars:
    NODE_ENV: production
    PORT: "3000"
  healthEndpoint: "/api/status"
  port: 3000
  volumes: []

domain:                      # Optional - skip for IP-only access
  name: "app.example.com"
  email: "admin@example.com"

options:
  createSnapshot: true
  healthCheckRetries: 10
  healthCheckInterval: 5000
  provisioningTimeout: 600000
  setupTimeout: 900000
`;

    const { writeFile } = await import('fs/promises');
    await writeFile(options.output, exampleConfig);
    console.log(`Example configuration created: ${options.output}`);
    console.log('\nNext steps:');
    console.log('  1. Edit the configuration file with your settings');
    console.log('  2. Set SERVERSGURU_API_KEY environment variable');
    console.log('  3. Run: sg-deploy deploy --dry-run');
    console.log('  4. Run: sg-deploy deploy');
  });

// Cancel command
program
  .command('cancel')
  .description('Cancel server at end of billing term')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID to cancel')
  .action(async (options: { config: string; serverId: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Scheduling cancellation for server ${options.serverId}...`);
      await client.cancelServer(parseInt(options.serverId, 10));
      console.log('Server scheduled for cancellation at end of billing term');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Uncancel command
program
  .command('uncancel')
  .description('Remove cancellation from server')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID to uncancel')
  .action(async (options: { config: string; serverId: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Removing cancellation from server ${options.serverId}...`);
      await client.uncancelServer(parseInt(options.serverId, 10));
      console.log('Cancellation removed');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Rename command
program
  .command('rename')
  .description('Rename a server')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .requiredOption('--name <name>', 'New server name')
  .action(async (options: { config: string; serverId: string; name: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Renaming server ${options.serverId} to "${options.name}"...`);
      await client.renameServer(parseInt(options.serverId, 10), options.name);
      console.log('Server renamed successfully');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Reset password command
program
  .command('reset-password')
  .description('Reset root password for a server')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .action(async (options: { config: string; serverId: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log(`Resetting password for server ${options.serverId}...`);
      const result = await client.resetPassword(parseInt(options.serverId, 10));
      console.log(`New password: ${result.password}`);
      console.log('\nIMPORTANT: Save this password securely!');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Protection command
program
  .command('protection')
  .description('Enable or disable server protection')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .requiredOption('--action <action>', 'Action: enable or disable')
  .action(async (options: { config: string; serverId: string; action: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      if (options.action === 'enable') {
        console.log(`Enabling protection for server ${options.serverId}...`);
        await client.enableProtection(parseInt(options.serverId, 10));
        console.log('Protection enabled');
      } else if (options.action === 'disable') {
        console.log(`Disabling protection for server ${options.serverId}...`);
        await client.disableProtection(parseInt(options.serverId, 10));
        console.log('Protection disabled');
      } else {
        throw new Error('Invalid action. Use: enable or disable');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// IPs command
program
  .command('ips')
  .description('Manage server IP addresses')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .option('--order <type>', 'Order new IP (ipv4 or ipv6)')
  .option('--delete <ipId>', 'Delete IP by ID')
  .action(
    async (options: { config: string; serverId: string; order?: string; delete?: string }) => {
      try {
        const config = await loadConfig(options.config);
        const client = new ServersGuruClient(config.serversGuru);
        const serverId = parseInt(options.serverId, 10);

        if (options.order) {
          const ipType = options.order as 'ipv4' | 'ipv6';
          if (!['ipv4', 'ipv6'].includes(ipType)) {
            throw new Error('Invalid IP type. Use: ipv4 or ipv6');
          }
          console.log(`Ordering ${ipType} for server ${serverId}...`);
          await client.orderIp(serverId, ipType);
          console.log('IP ordered successfully');
        } else if (options.delete) {
          const ipId = parseInt(options.delete, 10);
          console.log(`Deleting IP ${ipId} from server ${serverId}...`);
          await client.deleteIp(serverId, ipId);
          console.log('IP deleted successfully');
        } else {
          // List IPs
          console.log(`Fetching IPs for server ${serverId}...\n`);
          const ips = await client.listIps(serverId);

          if (ips.length === 0) {
            console.log('No IPs found');
            return;
          }

          console.log('ID\tType\tAddress\t\t\tRDNS\t\t\tActive');
          console.log('-'.repeat(80));
          for (const ip of ips) {
            console.log(
              `${ip.id}\t${ip.type}\t${ip.address}\t\t${ip.rdns ?? '-'}\t\t${ip.active ? 'Yes' : 'No'}`
            );
          }
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

// Backups command
program
  .command('backups')
  .description('Manage server backups')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .option('--enable', 'Enable automatic backups')
  .option('--disable', 'Disable automatic backups')
  .option('--restore <backupId>', 'Restore from backup ID')
  .option('--delete <backupId>', 'Delete backup by ID')
  .action(
    async (options: {
      config: string;
      serverId: string;
      enable?: boolean;
      disable?: boolean;
      restore?: string;
      delete?: string;
    }) => {
      try {
        const config = await loadConfig(options.config);
        const client = new ServersGuruClient(config.serversGuru);
        const serverId = parseInt(options.serverId, 10);

        if (options.enable) {
          console.log(`Enabling backups for server ${serverId}...`);
          await client.enableBackups(serverId);
          console.log('Backups enabled');
        } else if (options.disable) {
          console.log(`Disabling backups for server ${serverId}...`);
          await client.disableBackups(serverId);
          console.log('Backups disabled');
        } else if (options.restore) {
          const backupId = parseInt(options.restore, 10);
          console.log(`Restoring server ${serverId} from backup ${backupId}...`);
          const result = await client.restoreBackup(serverId, backupId);
          console.log(`Restore started. Process ID: ${result.upid}`);
        } else if (options.delete) {
          const backupId = parseInt(options.delete, 10);
          console.log(`Deleting backup ${backupId}...`);
          await client.deleteBackup(serverId, backupId);
          console.log('Backup deleted');
        } else {
          // List backups
          console.log(`Fetching backups for server ${serverId}...\n`);
          const backups = await client.listBackups(serverId);

          if (backups.length === 0) {
            console.log('No backups found');
            return;
          }

          console.log('ID\tName\t\t\tCreated\t\t\tSize\tStatus');
          console.log('-'.repeat(80));
          for (const backup of backups) {
            console.log(
              `${backup.id}\t${backup.name}\t${backup.createdAt}\t${backup.diskSize}GB\t${backup.status}`
            );
          }
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

// ISOs command
program
  .command('isos')
  .description('Manage server ISO images')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .option('--mount <isoId>', 'Mount ISO by ID')
  .option('--unmount', 'Unmount current ISO')
  .option('--search <query>', 'Search ISOs')
  .action(
    async (options: {
      config: string;
      serverId: string;
      mount?: string;
      unmount?: boolean;
      search?: string;
    }) => {
      try {
        const config = await loadConfig(options.config);
        const client = new ServersGuruClient(config.serversGuru);
        const serverId = parseInt(options.serverId, 10);

        if (options.mount) {
          const isoId = parseInt(options.mount, 10);
          console.log(`Mounting ISO ${isoId} to server ${serverId}...`);
          await client.mountIso(serverId, isoId);
          console.log('ISO mounted successfully');
        } else if (options.unmount) {
          console.log(`Unmounting ISO from server ${serverId}...`);
          await client.unmountIso(serverId);
          console.log('ISO unmounted successfully');
        } else {
          // List ISOs
          console.log(`Fetching ISOs for server ${serverId}...\n`);
          const isos = await client.listIsos(serverId, { search: options.search });

          if (isos.length === 0) {
            console.log('No ISOs found');
            return;
          }

          console.log('ID\tName');
          console.log('-'.repeat(50));
          for (const iso of isos) {
            console.log(`${iso.id}\t${iso.name}`);
          }
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

// Upgrade command
program
  .command('upgrade')
  .description('Upgrade server to a new plan')
  .option('-c, --config <path>', 'Configuration file path', 'deploy.yaml')
  .requiredOption('--server-id <id>', 'Server ID')
  .option('--list', 'List available upgrades')
  .option('--plan <plan>', 'Target plan identifier')
  .option('--type <type>', 'Upgrade type: nodisk or disk')
  .action(
    async (options: {
      config: string;
      serverId: string;
      list?: boolean;
      plan?: string;
      type?: string;
    }) => {
      try {
        const config = await loadConfig(options.config);
        const client = new ServersGuruClient(config.serversGuru);
        const serverId = parseInt(options.serverId, 10);

        if (options.list) {
          console.log(`Fetching available upgrades for server ${serverId}...`);
          const upgrades = await client.getAvailableUpgrades(serverId);
          console.log(JSON.stringify(upgrades, null, 2));
        } else if (options.plan && options.type) {
          const upgradeType = options.type as 'nodisk' | 'disk';
          if (!['nodisk', 'disk'].includes(upgradeType)) {
            throw new Error('Invalid upgrade type. Use: nodisk or disk');
          }
          console.log(`Upgrading server ${serverId} to plan ${options.plan}...`);
          await client.processUpgrade(serverId, options.plan, upgradeType);
          console.log('Upgrade initiated successfully');
        } else {
          console.log('Usage: sg-deploy upgrade --server-id <id> --list');
          console.log(
            '       sg-deploy upgrade --server-id <id> --plan <plan> --type <nodisk|disk>'
          );
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

program.parse();
