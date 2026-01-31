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
 * Apply environment variable overrides to config
 */
function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  // Override API key from environment
  if (process.env.SERVERSGURU_API_KEY) {
    config.serversGuru = {
      ...((config.serversGuru as Record<string, unknown>) || {}),
      apiKey: process.env.SERVERSGURU_API_KEY,
    };
  }

  // Override registry auth from environment
  const registryUser = process.env.DOCKER_REGISTRY_USERNAME;
  const registryPass = process.env.DOCKER_REGISTRY_PASSWORD;
  if (registryUser && registryUser !== '' && registryPass && registryPass !== '') {
    const app = (config.app as Record<string, unknown>) || {};
    config.app = {
      ...app,
      registryAuth: {
        username: registryUser,
        password: registryPass,
        registry: process.env.DOCKER_REGISTRY ?? 'ghcr.io',
      },
    };
  }

  return config;
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
        if (options.serverId) {
          if (!options.serverIp || !options.password) {
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
          if (result.snapshotId) {
            console.log(`Snapshot ID: ${result.snapshotId}`);
          }
          console.log(`Health Check: ${result.healthCheckPassed ? 'PASSED' : 'FAILED'}`);
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
  .action(async (options: { config: string }) => {
    try {
      const config = await loadConfig(options.config);
      const client = new ServersGuruClient(config.serversGuru);

      console.log('Fetching available products...\n');
      const products = await client.getProducts();

      console.log('ID\t\tCPU\tRAM\tDisk\tPrice/mo');
      console.log('-'.repeat(50));
      for (const product of products) {
        if (product.available) {
          console.log(
            `${product.id}\t\t${product.cpu}\t${product.ram}GB\t${product.disk}GB\t$${product.price.monthly}`
          );
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

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

program.parse();
