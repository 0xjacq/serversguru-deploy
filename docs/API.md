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

##### `rebuildServer(id: number, image: string): Promise<{ password: string }>`

Rebuild server with new OS.

**Parameters:**

- `id` - Server ID
- `image` - OS image name (note: parameter is `image`, not `osImage`)

##### `resetPassword(serverId: number): Promise<{ password: string }>`

Reset root password via rescue mode.

**Parameters:**

- `serverId` - Server ID

**Returns:** Object with new password

##### `cancelServer(serverId: number): Promise<void>`

Schedule server cancellation at end of billing term.

##### `uncancelServer(serverId: number): Promise<void>`

Remove scheduled cancellation.

##### `renameServer(serverId: number, name: string): Promise<void>`

Rename a server.

##### `changeBillingCycle(serverId: number, cycle: number): Promise<void>`

Change server billing cycle.

##### `enableProtection(serverId: number): Promise<void>`

Enable server protection (prevents accidental deletion).

##### `disableProtection(serverId: number): Promise<void>`

Disable server protection.

##### `getAvailableUpgrades(serverId: number): Promise<UpgradeOption[]>`

List available upgrade plans for a server.

##### `processUpgrade(serverId: number, plan: string, type: 'disk' | 'nodisk'): Promise<void>`

Upgrade server to a new plan.

**Parameters:**

- `serverId` - Server ID
- `plan` - New plan ID (e.g., 'NL1-4')
- `type` - 'disk' to resize disk, 'nodisk' to keep current disk

##### `listIps(serverId: number): Promise<IpInfo[]>`

List all IP addresses for a server.

##### `orderIp(serverId: number, type: 'ipv4' | 'ipv6'): Promise<IpInfo>`

Order a new IP address.

##### `deleteIp(serverId: number, ipId: number): Promise<void>`

Delete an IP address.

##### `updateIpRdns(serverId: number, ipId: number, rdns: string): Promise<void>`

Update reverse DNS for an IP address.

##### `resetIpRdns(serverId: number, ipId: number): Promise<void>`

Reset reverse DNS to default.

##### `listIsos(serverId: number): Promise<Iso[]>`

List available ISO images for a server.

##### `mountIso(serverId: number, isoId: number): Promise<void>`

Mount an ISO image to a server.

##### `unmountIso(serverId: number): Promise<void>`

Unmount the current ISO from a server.

##### `listBackups(serverId: number): Promise<Backup[]>`

List backups for a server.

##### `enableBackups(serverId: number): Promise<void>`

Enable automatic backups for a server.

##### `disableBackups(serverId: number): Promise<void>`

Disable automatic backups for a server.

##### `deleteBackup(serverId: number, backupId: number): Promise<void>`

Delete a backup.

##### `restoreBackup(serverId: number, backupId: number): Promise<{ upid: string }>`

Restore a server from a backup.

**Returns:** Object with `upid` for tracking progress

##### `getBackupStatus(serverId: number, upid: string): Promise<BackupStatus>`

Get the status of a backup or restore operation.

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
  arch?: 'x86' | 'arm64'; // CPU architecture
  cpuModel?: string; // CPU model name
  dedicated?: boolean; // Dedicated resources
  backupPrice?: number; // Backup price per month
  snapshotPrice?: number; // Snapshot price per month
  speed?: number; // Network speed in Mbps
  location?: string; // Primary location code
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
  expireAt?: string; // Expiration date
  term?: number; // Billing term in months
  price?: number; // Monthly price
  rdns?: string; // Reverse DNS
  cpu?: number; // Number of vCPUs
  ram?: number; // RAM in MB
  diskSize?: number; // Disk size in GB
  cpuModel?: string; // CPU model name
  disabled?: boolean; // Whether server is disabled
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
  userId?: number; // Owner user ID
  serverId?: number; // Associated server ID
  expirationDate?: string; // When snapshot expires
  active?: boolean; // Whether snapshot is active
  disabled?: boolean; // Whether snapshot is disabled
  isProtection?: boolean; // Protection snapshot
  price?: number; // Snapshot price
}
```

### IpInfo

```typescript
interface IpInfo {
  id: number;
  address: string;
  type: 'ipv4' | 'ipv6';
  rdns?: string;
  primary: boolean;
}
```

### Backup

```typescript
interface Backup {
  id: number;
  serverId: number;
  createdAt: string;
  size: number;
  status: string;
}
```

### Iso

```typescript
interface Iso {
  id: number;
  name: string;
  size: number;
  mounted: boolean;
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
type ProgressCallback = (step: DeploymentStep, message: string, progress?: number) => void;
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

Complete reference of all error codes with descriptions and recovery strategies.

#### API Errors

| Code                   | Description                   | Retryable | Recovery Strategy                              |
| ---------------------- | ----------------------------- | --------- | ---------------------------------------------- |
| `API_KEY_INVALID`      | API key is invalid or revoked | No        | Verify API key in Servers.guru dashboard       |
| `API_KEY_MISSING`      | No API key provided           | No        | Set `SERVERSGURU_API_KEY` environment variable |
| `API_RATE_LIMIT`       | Too many API requests         | Yes       | Wait 60 seconds, then retry                    |
| `API_TIMEOUT`          | API request timed out         | Yes       | Retry after 5 seconds                          |
| `API_UNKNOWN_ERROR`    | Unexpected API error          | Maybe     | Check API status, retry once                   |
| `INSUFFICIENT_BALANCE` | Account balance too low       | No        | Add funds at my.servers.guru/billing           |

#### VPS Errors

| Code                       | Description             | Retryable | Recovery Strategy                    |
| -------------------------- | ----------------------- | --------- | ------------------------------------ |
| `VPS_PRODUCT_UNAVAILABLE`  | VPS type out of stock   | No        | Choose different VPS type            |
| `VPS_IMAGE_UNAVAILABLE`    | OS image not available  | No        | Choose different OS image            |
| `VPS_ORDER_FAILED`         | Failed to order VPS     | No        | Check balance, try again             |
| `VPS_PROVISIONING_FAILED`  | VPS failed during setup | No        | Contact support                      |
| `VPS_PROVISIONING_TIMEOUT` | VPS taking too long     | Yes       | Increase timeout, retry              |
| `SERVER_NOT_FOUND`         | Server ID not found     | No        | Verify server ID                     |
| `SERVER_ERROR_STATE`       | Server in error state   | No        | Check server status, contact support |

#### SSH Errors

| Code                       | Description                     | Retryable | Recovery Strategy                    |
| -------------------------- | ------------------------------- | --------- | ------------------------------------ |
| `SSH_CONNECTION_TIMEOUT`   | Cannot establish SSH connection | Yes       | Wait for server, check firewall      |
| `SSH_CONNECTION_REFUSED`   | SSH port not responding         | Yes       | Wait for SSH service to start        |
| `SSH_AUTH_FAILED`          | Authentication failed           | No        | Verify password/SSH key              |
| `SSH_HOST_KEY_MISMATCH`    | Host key changed                | No        | Remove old key: `ssh-keygen -R <ip>` |
| `SSH_COMMAND_TIMEOUT`      | Command execution timeout       | Yes       | Increase `commandTimeout`            |
| `SSH_COMMAND_FAILED`       | Command returned non-zero       | No        | Check command output                 |
| `SSH_FILE_TRANSFER_FAILED` | SFTP transfer failed            | Yes       | Check disk space, retry              |

#### Docker Errors

| Code                     | Description                    | Retryable | Recovery Strategy               |
| ------------------------ | ------------------------------ | --------- | ------------------------------- |
| `DOCKER_NOT_INSTALLED`   | Docker not found on server     | No        | Use supported OS image          |
| `DOCKER_PULL_FAILED`     | Cannot pull Docker image       | Yes       | Check image name, registry auth |
| `DOCKER_LOGIN_FAILED`    | Registry authentication failed | No        | Verify registry credentials     |
| `DOCKER_COMPOSE_FAILED`  | Docker Compose error           | No        | Check compose file syntax       |
| `CONTAINER_UNHEALTHY`    | Container health check failed  | Yes       | Check container logs            |
| `CONTAINER_START_FAILED` | Container failed to start      | No        | Check container logs            |

#### Nginx Errors

| Code                   | Description                 | Retryable | Recovery Strategy          |
| ---------------------- | --------------------------- | --------- | -------------------------- |
| `NGINX_CONFIG_INVALID` | Invalid Nginx configuration | No        | Check configuration syntax |
| `NGINX_RELOAD_FAILED`  | Failed to reload Nginx      | No        | Check error logs           |

#### SSL Errors

| Code                          | Description                | Retryable | Recovery Strategy                   |
| ----------------------------- | -------------------------- | --------- | ----------------------------------- |
| `SSL_CERTIFICATE_FAILED`      | Let's Encrypt failed       | Maybe     | Check DNS, port 80 access           |
| `SSL_DNS_VERIFICATION_FAILED` | DNS verification failed    | No        | Verify DNS A record                 |
| `SSL_RATE_LIMIT`              | Let's Encrypt rate limited | No        | Wait 1 week or use different domain |

#### Configuration Errors

| Code                       | Description                | Retryable | Recovery Strategy                   |
| -------------------------- | -------------------------- | --------- | ----------------------------------- |
| `CONFIG_NOT_FOUND`         | Config file not found      | No        | Create config with `sg-deploy init` |
| `CONFIG_INVALID`           | Configuration syntax error | No        | Validate YAML syntax                |
| `CONFIG_VALIDATION_FAILED` | Schema validation failed   | No        | Check required fields               |
| `ENV_VAR_MISSING`          | Required env var not set   | No        | Set the environment variable        |

#### Health Check Errors

| Code                   | Description             | Retryable | Recovery Strategy         |
| ---------------------- | ----------------------- | --------- | ------------------------- |
| `HEALTH_CHECK_FAILED`  | App health check failed | Yes       | Check app logs, endpoint  |
| `HEALTH_CHECK_TIMEOUT` | Health check timed out  | Yes       | Increase retries/interval |

#### Snapshot Errors

| Code                      | Description             | Retryable | Recovery Strategy        |
| ------------------------- | ----------------------- | --------- | ------------------------ |
| `SNAPSHOT_CREATE_FAILED`  | Cannot create snapshot  | No        | Check disk space, limits |
| `SNAPSHOT_RESTORE_FAILED` | Cannot restore snapshot | No        | Verify snapshot exists   |
| `SNAPSHOT_NOT_FOUND`      | Snapshot ID not found   | No        | List available snapshots |

#### Generic Errors

| Code                   | Description                | Retryable | Recovery Strategy        |
| ---------------------- | -------------------------- | --------- | ------------------------ |
| `DEPLOYMENT_CANCELLED` | Deployment was cancelled   | No        | Restart deployment       |
| `DEPLOYMENT_TIMEOUT`   | Overall deployment timeout | Maybe     | Increase timeouts        |
| `UNKNOWN_ERROR`        | Unexpected error           | Maybe     | Check logs, report issue |

### Error Handling Examples

#### Basic Error Handling

```typescript
import { DeploymentError, isRetryableError, getRetryDelay } from 'serversguru-deploy';

try {
  await orchestrator.deploy();
} catch (error) {
  if (error instanceof DeploymentError) {
    console.error(`[${error.code}] ${error.message}`);

    if (error.suggestion) {
      console.log(`Suggestion: ${error.suggestion}`);
    }

    if (error.docsUrl) {
      console.log(`Documentation: ${error.docsUrl}`);
    }
  }
}
```

#### Retry Logic

```typescript
import { DeploymentError, isRetryableError, getRetryDelay } from 'serversguru-deploy';

async function deployWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await orchestrator.deploy();
    } catch (error) {
      if (error instanceof DeploymentError && isRetryableError(error)) {
        const delay = getRetryDelay(error);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error; // Non-retryable error
      }
    }
  }
  throw new Error(`Deployment failed after ${maxRetries} attempts`);
}
```

#### Error Context

```typescript
try {
  await orchestrator.deploy();
} catch (error) {
  if (error instanceof DeploymentError && error.context) {
    console.log(`Failed at step: ${error.context.step}`);
    console.log(`Server ID: ${error.context.serverId}`);
    console.log(`Server IP: ${error.context.serverIp}`);
  }
}
```

#### Formatting Errors

```typescript
// Console-friendly format
console.error(error.toConsoleString());
// Output:
// Error [SSH_CONNECTION_TIMEOUT]: Cannot connect to server
//   Step: wait-ssh
//   Server IP: 1.2.3.4
//
//   Suggestion: Check that the server is running...
//   Documentation: https://github.com/...

// JSON format (for logging systems)
console.log(JSON.stringify(error.toJSON(), null, 2));
```

### Error Class Hierarchy

```
Error
└── DeploymentError (base class)
    ├── ConfigError     (configuration issues)
    ├── ApiError        (API communication issues)
    ├── SshError        (SSH connection/execution issues)
    ├── ValidationError (schema validation issues)
    └── AggregateDeploymentError (multiple errors)
```

See [`src/errors.ts`](../src/errors.ts) for complete implementation.

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
