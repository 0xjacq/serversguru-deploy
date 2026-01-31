# API Documentation

## Overview

The `serversguru-deploy` package provides a TypeScript/JavaScript API for deploying applications to Servers.guru VPS instances.

## Installation

```bash
npm install serversguru-deploy
```

## Core Classes

### DeploymentOrchestrator

Main class for managing deployments.

```typescript
import { DeploymentOrchestrator, DeploymentConfigSchema } from 'serversguru-deploy';

const config = DeploymentConfigSchema.parse({
  serversGuru: {
    apiKey: process.env.SERVERSGURU_API_KEY,
  },
  vps: {
    type: 'NL1-2',
    osImage: 'ubuntu-22.04',
  },
  app: {
    name: 'my-app',
    dockerImage: 'nginx:latest',
    port: 3000,
  },
});

const orchestrator = new DeploymentOrchestrator(config);

// Set up progress callback
orchestrator.setProgressCallback((step, message, progress) => {
  console.log(`[${step}] ${message}`);
});

// Deploy
const result = await orchestrator.deploy();

if (result.success) {
  console.log(`Deployed to: ${result.appUrl}`);
} else {
  console.error('Deployment failed:', result.errors);
}
```

#### Methods

##### `deploy(): Promise<DeploymentResult>`

Execute a full deployment from ordering a VPS to health verification.

**Returns:** [`DeploymentResult`](#deploymentresult)

**Example:**
```typescript
const result = await orchestrator.deploy();
console.log(`Server ID: ${result.serverId}`);
console.log(`Server IP: ${result.serverIp}`);
console.log(`Health Check: ${result.healthCheckPassed ? 'PASSED' : 'FAILED'}`);
```

##### `deployToExisting(serverId: number, serverIp: string, password: string): Promise<DeploymentResult>`

Deploy to an existing VPS, skipping the ordering and provisioning steps.

**Parameters:**
- `serverId` - Existing server ID
- `serverIp` - Server IP address
- `password` - Server root password

**Returns:** [`DeploymentResult`](#deploymentresult)

**Example:**
```typescript
const result = await orchestrator.deployToExisting(12345, '192.168.1.100', 'password');
```

##### `rollback(snapshotId: number): Promise<void>`

Rollback the server to a previous snapshot.

**Parameters:**
- `snapshotId` - Snapshot ID to restore

**Example:**
```typescript
await orchestrator.rollback(999);
```

##### `setProgressCallback(callback: ProgressCallback): void`

Set a callback function to receive deployment progress updates.

**Parameters:**
- `callback` - Function called with `(step, message, progress?)`

**Example:**
```typescript
orchestrator.setProgressCallback((step, message, progress) => {
  console.log(`${step}: ${message}`);
  if (progress) {
    console.log(`${progress}% complete`);
  }
});
```

##### `getLogs(): string[]`

Get deployment logs.

**Returns:** Array of log messages

##### `getErrors(): string[]`

Get deployment errors.

**Returns:** Array of error messages

---

### ServersGuruClient

Low-level client for the Servers.guru API.

```typescript
import { ServersGuruClient } from 'serversguru-deploy';

const client = new ServersGuruClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://my.servers.guru/api',
});

const balance = await client.getBalance();
const products = await client.getProducts();
```

#### Methods

##### `getBalance(): Promise<number>`

Get account balance.

**Returns:** Balance in USD

##### `getProducts(): Promise<VpsProduct[]>`

Get available VPS products.

**Returns:** Array of [`VpsProduct`](#vpsproduct)

##### `getImages(): Promise<string[]>`

Get available OS images.

**Returns:** Array of image names (e.g., `['ubuntu-22.04', 'debian-11']`)

##### `listServers(options?): Promise<ServerInfo[]>`

List all servers.

**Parameters:**
- `options.search` - Filter by name
- `options.page` - Page number
- `options.perPage` - Items per page

**Returns:** Array of [`ServerInfo`](#serverinfo)

##### `getServer(id: number): Promise<ServerInfo>`

Get server details.

**Parameters:**
- `id` - Server ID

**Returns:** [`ServerInfo`](#serverinfo)

##### `getServerStatus(id: number): Promise<ServerStatus>`

Get server status.

**Parameters:**
- `id` - Server ID

**Returns:** [`ServerStatus`](#serverstatus)

##### `orderVps(config: VpsOrderConfig): Promise<OrderResult>`

Order a new VPS.

**Parameters:**
- `config.vpsType` - VPS product type (e.g., 'NL1-2')
- `config.osImage` - OS image (e.g., 'ubuntu-22.04')
- `config.billingCycle` - Billing cycle in months (1-12)
- `config.hostname` - Optional hostname

**Returns:** [`OrderResult`](#orderresult)

##### `startServer(id: number): Promise<void>`

Start a stopped server.

##### `stopServer(id: number): Promise<void>`

Stop a running server.

##### `rebootServer(id: number): Promise<void>`

Reboot a server.

##### `rebuildServer(id: number, osImage: string): Promise<{ password: string }>`

Rebuild server with new OS.

##### `listSnapshots(serverId: number): Promise<Snapshot[]>`

List server snapshots.

**Returns:** Array of [`Snapshot`](#snapshot)

##### `createSnapshot(serverId: number, name?: string): Promise<Snapshot>`

Create a snapshot.

**Parameters:**
- `serverId` - Server ID
- `name` - Optional snapshot name

**Returns:** [`Snapshot`](#snapshot)

##### `restoreSnapshot(serverId: number, snapshotId: number, targetServerId?: number): Promise<void>`

Restore a snapshot.

##### `waitForStatus(id: number, targetStatus: string, options?): Promise<ServerStatus>`

Wait for server to reach a specific status.

**Parameters:**
- `id` - Server ID
- `targetStatus` - Target status ('running', 'stopped', etc.)
- `options.timeout` - Timeout in milliseconds
- `options.pollInterval` - Polling interval in milliseconds
- `options.onProgress` - Progress callback

**Returns:** [`ServerStatus`](#serverstatus)

---

### SshProvisioner

SSH connection and command execution.

```typescript
import { SshProvisioner } from 'serversguru-deploy';

const ssh = new SshProvisioner({
  port: 22,
  username: 'root',
  connectionTimeout: 30000,
  commandTimeout: 300000,
});

await ssh.connect({
  host: '192.168.1.100',
  password: 'secret',
});

const result = await ssh.exec('ls -la');
console.log(result.stdout);

await ssh.disconnect();
```

#### Methods

##### `connect(credentials: SshCredentials): Promise<void>`

Connect to a server.

**Parameters:**
- `credentials.host` - Server IP or hostname
- `credentials.port` - SSH port (default: 22)
- `credentials.username` - Username
- `credentials.password` - Password (optional if using key)
- `credentials.privateKey` - Private key content (optional)

##### `disconnect(): Promise<void>`

Disconnect from server.

##### `exec(command: string, options?): Promise<ExecResult>`

Execute a command.

**Parameters:**
- `command` - Command to execute
- `options.timeout` - Command timeout in milliseconds

**Returns:** [`ExecResult`](#execresult)

##### `execOrFail(command: string, options?): Promise<string>`

Execute a command and throw on failure.

**Returns:** stdout string

##### `execAll(commands: string[], options?): Promise<ExecResult[]>`

Execute multiple commands.

##### `uploadFile(localPath: string, remotePath: string): Promise<void>`

Upload a file.

##### `uploadContent(content: string | Buffer, remotePath: string): Promise<void>`

Upload content directly.

##### `uploadTemplate(template: string, remotePath: string, vars: Record<string, string>): Promise<void>`

Upload a template with variable substitution.

##### `downloadFile(remotePath: string, localPath: string): Promise<void>`

Download a file.

##### `readFile(remotePath: string): Promise<string>`

Read remote file content.

##### `fileExists(remotePath: string): Promise<boolean>`

Check if file exists.

##### `mkdir(remotePath: string): Promise<void>`

Create directory (recursive).

##### `isConnected(): boolean`

Check if connected.

##### `static waitForSsh(host: string, options?): Promise<void>`

Wait for SSH to become available.

**Parameters:**
- `host` - Server IP or hostname
- `options.port` - SSH port
- `options.timeout` - Timeout in milliseconds
- `options.retryInterval` - Retry interval
- `options.onRetry` - Retry callback

---

## Configuration

### DeploymentConfig

```typescript
interface DeploymentConfig {
  serversGuru: {
    apiKey: string;
    baseUrl?: string;
  };
  vps: {
    type: string;
    osImage: string;
    billingCycle?: number;
    hostname?: string;
  };
  ssh?: {
    port?: number;
    username?: string;
    privateKeyPath?: string;
    connectionTimeout?: number;
    commandTimeout?: number;
  };
  app: {
    name: string;
    dockerImage: string;
    registryAuth?: {
      username: string;
      password: string;
      registry?: string;
    };
    envVars?: Record<string, string>;
    healthEndpoint?: string;
    port?: number;
    volumes?: string[];
  };
  domain?: {
    name: string;
    email: string;
  };
  options?: {
    createSnapshot?: boolean;
    healthCheckRetries?: number;
    healthCheckInterval?: number;
    provisioningTimeout?: number;
    setupTimeout?: number;
  };
}
```

---

## Types

### DeploymentResult

```typescript
interface DeploymentResult {
  success: boolean;
  serverId: number;
  serverIp: string;
  snapshotId?: number;
  healthCheckPassed: boolean;
  deployedAt: string;
  appUrl?: string;
  errors: string[];
  logs: string[];
}
```

### VpsProduct

```typescript
interface VpsProduct {
  id: string;
  name: string;
  cpu: number;
  ram: number;
  disk: number;
  bandwidth: number;
  price: {
    monthly: number;
    yearly: number;
  };
  locations: string[];
  available: boolean;
}
```

### ServerInfo

```typescript
interface ServerInfo {
  id: number;
  name: string;
  status: string;
  ipv4: string;
  ipv6?: string;
  password?: string;
  osImage: string;
  vpsType: string;
  datacenter: string;
  createdAt: string;
}
```

### ServerStatus

```typescript
interface ServerStatus {
  status: 'running' | 'stopped' | 'provisioning' | 'error' | string;
  uptime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
}
```

### Snapshot

```typescript
interface Snapshot {
  id: number;
  name: string;
  size: number;
  createdAt: string;
  status: string;
}
```

### OrderResult

```typescript
interface OrderResult {
  success: boolean;
  serverId: number;
  ipv4: string;
  password: string;
  message?: string;
}
```

### ExecResult

```typescript
interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}
```

### ProgressCallback

```typescript
type ProgressCallback = (
  step: DeploymentStep,
  message: string,
  progress?: number
) => void;
```

### DeploymentStep

```typescript
type DeploymentStep =
  | 'check-balance'
  | 'order-vps'
  | 'wait-provisioning'
  | 'wait-ssh'
  | 'setup-server'
  | 'deploy-application'
  | 'configure-nginx'
  | 'obtain-ssl'
  | 'health-check'
  | 'create-snapshot'
  | 'complete';
```

---

## Error Handling

The package exports custom error classes for better error handling:

```typescript
import { DeploymentError, ConfigError, ApiError, SshError } from 'serversguru-deploy';

try {
  await orchestrator.deploy();
} catch (error) {
  if (error instanceof DeploymentError) {
    console.log(`Error Code: ${error.code}`);
    console.log(`Message: ${error.message}`);
    console.log(`Suggestion: ${error.suggestion}`);
    console.log(`Docs: ${error.docsUrl}`);
  }
}
```

### Error Codes

- `API_KEY_INVALID` - Invalid API key
- `INSUFFICIENT_BALANCE` - Not enough funds
- `VPS_PROVISIONING_FAILED` - VPS failed to provision
- `SSH_CONNECTION_TIMEOUT` - Cannot connect via SSH
- `DOCKER_PULL_FAILED` - Cannot pull Docker image
- `HEALTH_CHECK_FAILED` - Application health check failed
- `SSL_CERTIFICATE_FAILED` - SSL certificate generation failed
- `CONFIG_INVALID` - Invalid configuration

See [`src/errors.ts`](../src/errors.ts) for complete list.

---

## Templates

The package includes templates for server setup:

```typescript
import {
  SETUP_SCRIPT,
  DOCKER_COMPOSE_TEMPLATE,
  NGINX_CONFIG_TEMPLATE,
  renderTemplate,
} from 'serversguru-deploy';

const nginxConfig = renderTemplate(NGINX_CONFIG_TEMPLATE, {
  DOMAIN: 'example.com',
  APP_PORT: '3000',
});
```

---

## Utilities

### Pre-flight Checks

```typescript
import { runPreflightChecks } from 'serversguru-deploy';

const results = await runPreflightChecks(config, 'deploy.yaml');

if (results.canProceed) {
  await orchestrator.deploy();
} else {
  console.log(results.results);
}
```

### Logging

```typescript
import { getLogger, createCILogger } from 'serversguru-deploy';

const logger = getLogger();
logger.info('Starting deployment');
logger.error('Something went wrong', { error: err });

// For CI environments
const ciLogger = createCILogger('info');
```
