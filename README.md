# serversguru-deploy

[![npm version](https://badge.fury.io/js/serversguru-deploy.svg)](https://www.npmjs.com/package/serversguru-deploy)
[![CI](https://github.com/0xjacq/serversguru-deploy/actions/workflows/ci.yml/badge.svg)](https://github.com/0xjacq/serversguru-deploy/actions)
[![codecov](https://codecov.io/gh/0xjacq/serversguru-deploy/branch/main/graph/badge.svg)](https://codecov.io/gh/0xjacq/serversguru-deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Autonomous VPS deployment using Servers.guru API with SSH provisioning**

Deploy your Docker applications to VPS instances with a single command. Handles everything from ordering the server to SSL certificates.

## Features

- 🚀 **One-command deployment** - Order, configure, and deploy in a single command
- 🔒 **SSL automation** - Let's Encrypt certificates via Certbot
- 🐳 **Docker-native** - Pull images from any registry and deploy with docker-compose
- 📝 **Infrastructure as Code** - Configure via YAML or JavaScript/TypeScript
- 🔄 **Snapshot-based rollback** - Create snapshots after successful deployments
- ✅ **Health verification** - Verify application health before marking complete
- 🧪 **Pre-flight checks** - Validate configuration before deployment
- 📊 **Structured logging** - JSON or pretty output with sensitive data redaction
- 🔧 **TypeScript support** - Fully typed API

## Important Notes

### GitHub Actions / CI/CD Compatibility

> ⚠️ **The Servers.guru API may block requests from GitHub Actions IPs.** If you see HTTP 303 redirects to `/login` in your CI/CD pipeline, you'll need to deploy from a local machine instead.

**Workaround options:**

1. Run `npx serversguru-deploy deploy` from your local machine
2. Use a self-hosted GitHub Actions runner
3. Contact Servers.guru support about IP whitelisting

### Root Password Access

The API does not return root passwords when ordering VPS. After ordering, check the Servers.guru dashboard for your server credentials.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [Programmatic API](#programmatic-api)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Global Installation (Recommended for CLI)

```bash
npm install -g serversguru-deploy
```

### Local Installation (for API usage)

```bash
npm install serversguru-deploy
```

### Using npx (no installation)

```bash
npx serversguru-deploy --help
```

## Quick Start

### 1. Get your API Key

Sign up at [Servers.guru](https://my.servers.guru) and get your API key from the account settings.

### 2. Initialize Configuration

```bash
sg-deploy init
```

This creates `deploy.yaml` with example configuration.

### 3. Configure your deployment

Edit `deploy.yaml`:

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}' # Use env var for security

vps:
  type: 'NL1-2' # VPS product type
  osImage: 'ubuntu-22.04' # OS image
  billingCycle: 1 # Months (1-12)

app:
  name: 'my-app'
  dockerImage: 'nginx:latest'
  port: 80
  healthEndpoint: '/'

domain:
  name: 'app.example.com'
  email: 'admin@example.com'
```

### 4. Set environment variables

```bash
export SERVERSGURU_API_KEY="your-api-key"
```

### 5. Run pre-flight checks

```bash
sg-deploy deploy --dry-run
```

### 6. Deploy

```bash
sg-deploy deploy
```

## CLI Usage

### Commands

#### `deploy`

Deploy application to a new or existing VPS.

```bash
# New VPS deployment
sg-deploy deploy -c deploy.yaml

# Deploy to existing server
sg-deploy deploy --server-id 123 --server-ip 1.2.3.4 --password "secret"

# Dry run (validate only)
sg-deploy deploy --dry-run

# JSON output for CI/CD
sg-deploy deploy --format json
```

#### `init`

Create example configuration file.

```bash
sg-deploy init
sg-deploy init -o my-deploy.yaml
```

#### `status`

Check server status.

```bash
sg-deploy status --server-id 123
```

#### `list`

List all your servers.

```bash
sg-deploy list
sg-deploy list --search "prod"
```

#### `products`

List available VPS products with architecture and filtering.

```bash
sg-deploy products                    # List all products
sg-deploy products --arch x86         # Filter by architecture
sg-deploy products --location NL      # Filter by location
sg-deploy products --max-price 10     # Filter by max price
sg-deploy products --json             # JSON output
```

#### `images`

List available OS images.

```bash
sg-deploy images
```

#### `snapshots`

List server snapshots.

```bash
sg-deploy snapshots --server-id 123
```

#### `rollback`

Rollback server to a snapshot.

```bash
sg-deploy rollback --server-id 123 --snapshot-id 456
```

#### `power`

Server power control.

```bash
sg-deploy power --server-id 123 --action start
sg-deploy power --server-id 123 --action shutdown
sg-deploy power --server-id 123 --action reboot
```

#### `balance`

Check account balance.

```bash
sg-deploy balance
```

#### `cancel` / `uncancel`

Cancel or uncancel a server.

```bash
sg-deploy cancel --server-id 123      # Schedule cancellation at end of term
sg-deploy uncancel --server-id 123    # Remove cancellation
```

#### `rename`

Rename a server.

```bash
sg-deploy rename --server-id 123 --name "my-production-server"
```

#### `reset-password`

Reset root password for a server.

```bash
sg-deploy reset-password --server-id 123
```

#### `protection`

Enable or disable server protection.

```bash
sg-deploy protection --server-id 123 --action enable
sg-deploy protection --server-id 123 --action disable
```

#### `ips`

Manage server IP addresses.

```bash
sg-deploy ips --server-id 123                 # List IPs
sg-deploy ips --server-id 123 --order ipv4    # Order new IPv4
sg-deploy ips --server-id 123 --delete 456    # Delete IP by ID
```

#### `backups`

Manage server backups.

```bash
sg-deploy backups --server-id 123             # List backups
sg-deploy backups --server-id 123 --enable    # Enable auto-backups
sg-deploy backups --server-id 123 --disable   # Disable auto-backups
sg-deploy backups --server-id 123 --restore 456  # Restore from backup
sg-deploy backups --server-id 123 --delete 456   # Delete backup
```

#### `isos`

Manage server ISO images.

```bash
sg-deploy isos --server-id 123                # List available ISOs
sg-deploy isos --server-id 123 --mount 456    # Mount ISO
sg-deploy isos --server-id 123 --unmount      # Unmount current ISO
sg-deploy isos --server-id 123 --search ubuntu  # Search ISOs
```

#### `upgrade`

Upgrade server to a new plan.

```bash
sg-deploy upgrade --server-id 123 --list                    # List available upgrades
sg-deploy upgrade --server-id 123 --plan NL1-4 --type nodisk  # Upgrade without disk
sg-deploy upgrade --server-id 123 --plan NL1-4 --type disk    # Upgrade with disk
```

### Global Options

```bash
-c, --config <path>     Configuration file path (default: "deploy.yaml")
--format <format>       Output format: json, table (default: "table")
--quiet                 Suppress non-error output
-v, --verbose           Verbose output
-h, --help              Display help
--version               Display version
```

## Programmatic API

### Basic Usage

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
    port: 80,
  },
});

const orchestrator = new DeploymentOrchestrator(config);

orchestrator.setProgressCallback((step, message) => {
  console.log(`[${step}] ${message}`);
});

const result = await orchestrator.deploy();

if (result.success) {
  console.log(`✓ Deployed to: ${result.appUrl}`);
} else {
  console.error('✗ Deployment failed:', result.errors);
}
```

### Error Handling

```typescript
import { DeploymentError, isRetryableError } from 'serversguru-deploy';

try {
  await orchestrator.deploy();
} catch (error) {
  if (error instanceof DeploymentError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    console.error(`Suggestion: ${error.suggestion}`);
    console.error(`Docs: ${error.docsUrl}`);

    if (isRetryableError(error)) {
      console.log('This error is retryable');
    }
  }
}
```

### Pre-flight Checks

```typescript
import { runPreflightChecks } from 'serversguru-deploy';

const results = await runPreflightChecks(config, 'deploy.yaml');

if (results.canProceed) {
  console.log('✓ All checks passed, ready to deploy');
  await orchestrator.deploy();
} else {
  console.error('✗ Some checks failed:');
  for (const result of results.results) {
    if (!result.passed) {
      console.error(`  - ${result.name}: ${result.message}`);
    }
  }
}
```

### Low-level API Client

```typescript
import { ServersGuruClient } from 'serversguru-deploy';

const client = new ServersGuruClient({
  apiKey: process.env.SERVERSGURU_API_KEY,
});

// Check balance
const balance = await client.getBalance();
console.log(`Balance: $${balance}`);

// List products with architecture info
const products = await client.getProducts();
const armProducts = products.filter((p) => p.arch === 'arm64');
console.log('x86 products:', products.filter((p) => p.arch === 'x86').length);

// Order VPS
const order = await client.orderVps({
  vpsType: 'NL1-2',
  osImage: 'ubuntu-22.04',
  billingCycle: 1,
});
console.log(`Server ordered: ${order.serverId} at ${order.ipv4}`);

// Server management
await client.renameServer(123, 'my-prod-server');
await client.enableProtection(123);
const { password } = await client.resetPassword(123);

// IP management
const ips = await client.listIps(123);
await client.orderIp(123, 'ipv4');

// Backup management
const backups = await client.listBackups(123);
await client.enableBackups(123);
const { upid } = await client.restoreBackup(123, 456);

// ISO management
const isos = await client.listIsos(123);
await client.mountIso(123, 456);
```

See [API Documentation](docs/API.md) for complete API reference.

## Configuration

### Configuration File (YAML)

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}' # Use env var for security
  baseUrl: https://my.servers.guru/api # Optional

vps:
  type: 'NL1-2' # VPS product type (use 'sg-deploy products' to list)
  osImage: 'ubuntu-22.04' # OS image (use 'sg-deploy images' to list)
  billingCycle: 1 # Months (1-12)
  hostname: 'my-app' # Optional hostname

ssh:
  port: 22
  username: root
  privateKeyPath: ~/.ssh/id_rsa # Optional - use key auth instead of password
  connectionTimeout: 30000 # 30 seconds
  commandTimeout: 300000 # 5 minutes

app:
  name: 'my-app'
  dockerImage: 'ghcr.io/user/my-app:latest'
  registryAuth: # Optional - for private registries
    username: '${DOCKER_REGISTRY_USERNAME}'
    password: '${DOCKER_REGISTRY_PASSWORD}'
    registry: ghcr.io
  envVars:
    NODE_ENV: production
    PORT: '3000'
  healthEndpoint: '/api/status'
  port: 3000
  volumes:
    - './data:/app/data'
    - './logs:/app/logs'

domain: # Optional - skip for IP-only access
  name: 'app.example.com'
  email: 'admin@example.com' # For Let's Encrypt

options:
  createSnapshot: true
  healthCheckRetries: 10
  healthCheckInterval: 5000
  provisioningTimeout: 600000 # 10 minutes
  setupTimeout: 900000 # 15 minutes
```

### Environment Variables

| Variable                   | Description                          | Required                    |
| -------------------------- | ------------------------------------ | --------------------------- |
| `SERVERSGURU_API_KEY`      | Your Servers.guru API key            | Yes                         |
| `DOCKER_REGISTRY_USERNAME` | Docker registry username             | For private images          |
| `DOCKER_REGISTRY_PASSWORD` | Docker registry password/token       | For private images          |
| `DOCKER_REGISTRY`          | Docker registry URL                  | Optional (default: ghcr.io) |
| `LOG_LEVEL`                | Log level (debug, info, warn, error) | Optional (default: info)    |

### Programmatic Configuration

```typescript
import { DeploymentConfigSchema } from 'serversguru-deploy';

const config = DeploymentConfigSchema.parse({
  serversGuru: {
    apiKey: process.env.SERVERSGURU_API_KEY,
  },
  vps: {
    type: 'NL1-2',
    osImage: 'ubuntu-22.04',
    billingCycle: 1,
  },
  ssh: {
    port: 22,
    username: 'root',
    privateKeyPath: '~/.ssh/id_rsa',
  },
  app: {
    name: 'my-app',
    dockerImage: 'nginx:latest',
    port: 80,
    envVars: {
      NODE_ENV: 'production',
    },
  },
});
```

## Examples

See the [examples/](examples/) directory for complete examples:

- [Basic Node.js App](examples/basic-nodejs/) - Simple Express.js deployment
- [Next.js App](examples/nextjs/) - Next.js with custom domain
- [Docker Compose](examples/docker-compose/) - Multi-container setup
- [CI/CD Integration](examples/ci-cd/) - GitHub Actions workflow

## Troubleshooting

### Common Issues

#### "API key invalid"

```bash
# Verify your API key is set
echo $SERVERSGURU_API_KEY

# Set it if missing
export SERVERSGURU_API_KEY="your-api-key"
```

#### "Insufficient balance"

Add funds to your Servers.guru account at https://my.servers.guru/billing

#### "SSH connection timeout"

- Check that the server is running: `sg-deploy status --server-id <id>`
- Verify firewall rules allow SSH (port 22)
- Try increasing `connectionTimeout` in config

#### "Docker pull failed"

- Verify Docker image name and tag
- Check registry credentials for private images
- Ensure the image exists in the registry

#### "Health check failed"

- Verify the `healthEndpoint` path is correct
- Check that your application is running on the correct port
- View logs: `ssh root@<ip> "docker logs <app-name>"`

### Network and Firewall Issues

The deployment requires these ports to be accessible:

| Port     | Protocol | Purpose                             |
| -------- | -------- | ----------------------------------- |
| 22       | TCP      | SSH access for provisioning         |
| 80       | TCP      | HTTP (required for SSL certificate) |
| 443      | TCP      | HTTPS (your application)            |
| App port | TCP      | Your application port (e.g., 3000)  |

If you're behind a corporate firewall or VPN:

- Ensure outbound SSH (port 22) is allowed
- Verify you can reach Servers.guru API endpoints

### Docker Registry Authentication

For private registries, set credentials in your config:

```yaml
app:
  registryAuth:
    username: '${DOCKER_REGISTRY_USERNAME}'
    password: '${DOCKER_REGISTRY_PASSWORD}'
    registry: ghcr.io # or docker.io, your-registry.com
```

**GitHub Container Registry (ghcr.io):**

```bash
export DOCKER_REGISTRY_USERNAME="your-github-username"
export DOCKER_REGISTRY_PASSWORD="ghp_your-personal-access-token"
```

**Docker Hub:**

```bash
export DOCKER_REGISTRY_USERNAME="your-dockerhub-username"
export DOCKER_REGISTRY_PASSWORD="your-access-token"
```

### SSL Certificate Issues

**Let's Encrypt rate limits:**

- 5 certificates per domain per week
- 50 certificates per registered domain per week
- Wait or use a different subdomain if rate limited

**DNS propagation:**

- Ensure DNS A record points to server IP
- Use `dig your-domain.com` to verify
- Propagation can take up to 24-48 hours

**Port 80 blocked:**

- Let's Encrypt requires port 80 for HTTP-01 challenge
- Ensure no firewall blocks port 80
- Temporarily disable any existing web server

### Snapshot Failures

**"Snapshot create failed":**

- Ensure sufficient disk space on VPS
- Check provider snapshot limits (usually 3-5 per server)
- Delete old snapshots: `sg-deploy snapshots --server-id <id>`

**Snapshot restoration issues:**

- Server must be stopped for some providers
- Restoration can take 5-15 minutes
- Verify snapshot exists: `sg-deploy snapshots --server-id <id>`

### VPS Provisioning Delays

**Server stuck in "provisioning":**

- Provisioning typically takes 2-5 minutes
- Check server status: `sg-deploy status --server-id <id>`
- Increase `provisioningTimeout` in config (default: 10 minutes)

**VPS type unavailable:**

- Check available products: `sg-deploy products`
- Try a different location or VPS type
- Contact Servers.guru support for stock ETA

### SSH Connection Issues

**"SSH host key mismatch":**

```bash
# Remove old host key (server was rebuilt)
ssh-keygen -R <server-ip>
```

**"Permission denied (publickey)":**

- Verify SSH key format (OpenSSH or PEM)
- Check key file permissions: `chmod 600 ~/.ssh/id_rsa`
- Ensure private key matches the public key on server

**SSH key configuration:**

```yaml
ssh:
  privateKeyPath: ~/.ssh/id_rsa # Path to private key
  # OR use password authentication (default for new VPS)
```

### App Health Check Failures

**Timeout issues:**

```yaml
options:
  healthCheckRetries: 20 # Increase retries (default: 10)
  healthCheckInterval: 5000 # Interval between checks in ms
```

**Endpoint configuration:**

- Health endpoint must return HTTP 200
- Default timeout is 5 seconds per check
- Example health endpoint:
  ```javascript
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  ```

**Debugging health checks:**

```bash
# SSH to server and test endpoint
ssh root@<ip>
curl -v http://localhost:3000/health

# Check container logs
docker logs <app-name>

# Check if container is running
docker ps
```

### Memory and Resource Issues

**VPS sizing guide:**

| App Type            | Recommended VPS | RAM   | vCPUs |
| ------------------- | --------------- | ----- | ----- |
| Static site         | NL1-1           | 1GB   | 1     |
| Simple Node.js      | NL1-2           | 2GB   | 2     |
| Next.js / React SSR | NL1-2 or NL1-4  | 2-4GB | 2-4   |
| Multi-container     | NL1-4+          | 4GB+  | 4+    |
| Database + App      | NL1-4+          | 4GB+  | 4+    |

**"Container OOM killed":**

- Increase VPS RAM (upgrade VPS type)
- Optimize application memory usage
- Add memory limits to container:
  ```yaml
  app:
    envVars:
      NODE_OPTIONS: '--max-old-space-size=1024'
  ```

**Disk space issues:**

```bash
# Check disk usage
ssh root@<ip> "df -h"

# Clean Docker resources
ssh root@<ip> "docker system prune -af"
```

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug sg-deploy deploy
```

### Getting Help

- [API Documentation](docs/API.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Advanced Usage Guide](docs/ADVANCED.md)
- [GitHub Issues](https://github.com/0xjacq/serversguru-deploy/issues)
- [Servers.guru Documentation](https://my.servers.guru/docs)

## Requirements

- Node.js 18.0.0 or higher
- A Servers.guru account with API access
- Sufficient account balance for VPS deployment

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

For security issues, please see [SECURITY.md](SECURITY.md).

## License

MIT © [0xjacq](https://github.com/0xjacq)

---

<p align="center">
  Made with ❤️ for the Servers.guru community
</p>
