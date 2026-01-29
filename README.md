# serversguru-deploy

Autonomous VPS deployment using [Servers.guru API](https://my.servers.guru/api) with SSH provisioning.

## Features

- **Full VPS lifecycle management** - Order, configure, and deploy in one command
- **SSH-based provisioning** - Docker, Nginx, firewall setup via SSH
- **Docker deployment** - Pull images from any registry and deploy with docker-compose
- **SSL automation** - Let's Encrypt certificate via Certbot
- **Snapshot-based rollback** - Create snapshots after successful deployments
- **Health verification** - Verify application health before marking complete

## Installation

```bash
npm install serversguru-deploy
```

Or run directly with npx:

```bash
npx serversguru-deploy init
```

## Quick Start

### 1. Create configuration file

```bash
npx serversguru-deploy init
```

This creates `deploy.yaml` with example configuration.

### 2. Configure your deployment

Edit `deploy.yaml`:

```yaml
serversGuru:
  apiKey: "${SERVERSGURU_API_KEY}"

vps:
  type: "NL1-2"
  osImage: "ubuntu-22.04"
  billingCycle: 1

app:
  name: "my-app"
  dockerImage: "ghcr.io/user/my-app:latest"
  envVars:
    NODE_ENV: production
  port: 3000
  healthEndpoint: "/api/status"

domain:
  name: "app.example.com"
  email: "admin@example.com"
```

### 3. Set environment variables

```bash
export SERVERSGURU_API_KEY="your-api-key"
export DOCKER_REGISTRY_USERNAME="your-username"
export DOCKER_REGISTRY_PASSWORD="your-token"
```

### 4. Deploy

```bash
# Validate configuration
npx serversguru-deploy deploy --dry-run

# Full deployment
npx serversguru-deploy deploy
```

## CLI Commands

### deploy

Deploy application to a new or existing VPS.

```bash
# New VPS deployment
sg-deploy deploy -c deploy.yaml

# Deploy to existing server
sg-deploy deploy --server-id 123 --server-ip 1.2.3.4 --password "secret"

# Dry run (validate only)
sg-deploy deploy --dry-run
```

### status

Check server status.

```bash
sg-deploy status --server-id 123
```

### list

List all your servers.

```bash
sg-deploy list
sg-deploy list --search "prod"
```

### products

List available VPS products.

```bash
sg-deploy products
```

### images

List available OS images.

```bash
sg-deploy images
```

### snapshots

List server snapshots.

```bash
sg-deploy snapshots --server-id 123
```

### rollback

Rollback server to a snapshot.

```bash
sg-deploy rollback --server-id 123 --snapshot-id 456
```

### power

Server power control.

```bash
sg-deploy power --server-id 123 --action start
sg-deploy power --server-id 123 --action shutdown
sg-deploy power --server-id 123 --action reboot
```

### balance

Check account balance.

```bash
sg-deploy balance
```

## Programmatic Usage

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
    dockerImage: 'ghcr.io/user/my-app:latest',
    port: 3000,
  },
});

const orchestrator = new DeploymentOrchestrator(config);

orchestrator.setProgressCallback((step, message) => {
  console.log(`[${step}] ${message}`);
});

const result = await orchestrator.deploy();

if (result.success) {
  console.log(`Deployed to: ${result.appUrl}`);
} else {
  console.error('Deployment failed:', result.errors);
}
```

## API Client

Use the Servers.guru API client directly:

```typescript
import { ServersGuruClient } from 'serversguru-deploy';

const client = new ServersGuruClient({
  apiKey: process.env.SERVERSGURU_API_KEY,
});

// List products
const products = await client.getProducts();

// Order VPS
const order = await client.orderVps({
  vpsType: 'NL1-2',
  osImage: 'ubuntu-22.04',
  billingCycle: 1,
});

// Wait for ready
await client.waitForStatus(order.serverId, 'running');

// Create snapshot
const snapshot = await client.createSnapshot(order.serverId, 'initial');
```

## SSH Provisioner

Use SSH provisioner for custom server setup:

```typescript
import { SshProvisioner } from 'serversguru-deploy';

const ssh = new SshProvisioner();

// Wait for SSH availability
await SshProvisioner.waitForSsh('1.2.3.4');

// Connect
await ssh.connect({
  host: '1.2.3.4',
  password: 'server-password',
});

// Execute commands
const result = await ssh.execOrFail('docker ps');
console.log(result);

// Upload files
await ssh.uploadContent('Hello World', '/tmp/hello.txt');

// Disconnect
await ssh.disconnect();
```

## Configuration Reference

### serversGuru

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| apiKey | string | Yes | Servers.guru API key |
| baseUrl | string | No | API base URL (default: https://my.servers.guru/api) |

### vps

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | VPS product type (e.g., "NL1-2") |
| osImage | string | Yes | OS image (e.g., "ubuntu-22.04") |
| billingCycle | number | No | Months 1-12 (default: 1) |
| hostname | string | No | Server hostname |

### app

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Application name |
| dockerImage | string | Yes | Docker image to deploy |
| registryAuth | object | No | Registry credentials |
| envVars | object | No | Environment variables |
| port | number | No | Application port (default: 3000) |
| healthEndpoint | string | No | Health check path (default: /api/status) |
| volumes | string[] | No | Volume mounts |

### domain

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Domain name |
| email | string | Yes | Email for Let's Encrypt |

### options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| createSnapshot | boolean | true | Create snapshot after deploy |
| healthCheckRetries | number | 10 | Health check retry count |
| healthCheckInterval | number | 5000 | Health check interval (ms) |
| provisioningTimeout | number | 600000 | VPS provisioning timeout (ms) |
| setupTimeout | number | 900000 | Server setup timeout (ms) |

## Deployment Flow

1. **Check Balance** - Verify account has sufficient funds
2. **Order VPS** - Provision new VPS with specified configuration
3. **Wait for Provisioning** - Poll until server is running
4. **Wait for SSH** - Wait for SSH daemon to be available
5. **Setup Server** - Install Docker, Nginx, configure firewall
6. **Deploy Application** - Pull image, start container
7. **Configure Nginx** - Set up reverse proxy
8. **Obtain SSL** - Get Let's Encrypt certificate (if domain configured)
9. **Health Check** - Verify application is responding
10. **Create Snapshot** - Save deployment state for rollback

## License

MIT
