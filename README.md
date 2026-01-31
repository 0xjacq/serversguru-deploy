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
  apiKey: "${SERVERSGURU_API_KEY}"  # Use env var for security

vps:
  type: "NL1-2"              # VPS product type
  osImage: "ubuntu-22.04"    # OS image
  billingCycle: 1            # Months (1-12)

app:
  name: "my-app"
  dockerImage: "nginx:latest"
  port: 80
  healthEndpoint: "/"

domain:
  name: "app.example.com"
  email: "admin@example.com"
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

List available VPS products.

```bash
sg-deploy products
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

// List products
const products = await client.getProducts();
console.log('Available VPS types:', products.map(p => p.id));

// Order VPS
const order = await client.orderVps({
  vpsType: 'NL1-2',
  osImage: 'ubuntu-22.04',
  billingCycle: 1,
});
console.log(`Server ordered: ${order.serverId} at ${order.ipv4}`);
```

See [API Documentation](docs/API.md) for complete API reference.

## Configuration

### Configuration File (YAML)

```yaml
serversGuru:
  apiKey: "${SERVERSGURU_API_KEY}"  # Use env var for security
  baseUrl: https://my.servers.guru/api  # Optional

vps:
  type: "NL1-2"              # VPS product type (use 'sg-deploy products' to list)
  osImage: "ubuntu-22.04"    # OS image (use 'sg-deploy images' to list)
  billingCycle: 1            # Months (1-12)
  hostname: "my-app"         # Optional hostname

ssh:
  port: 22
  username: root
  privateKeyPath: ~/.ssh/id_rsa  # Optional - use key auth instead of password
  connectionTimeout: 30000   # 30 seconds
  commandTimeout: 300000     # 5 minutes

app:
  name: "my-app"
  dockerImage: "ghcr.io/user/my-app:latest"
  registryAuth:              # Optional - for private registries
    username: "${DOCKER_REGISTRY_USERNAME}"
    password: "${DOCKER_REGISTRY_PASSWORD}"
    registry: ghcr.io
  envVars:
    NODE_ENV: production
    PORT: "3000"
  healthEndpoint: "/api/status"
  port: 3000
  volumes:
    - "./data:/app/data"
    - "./logs:/app/logs"

domain:                      # Optional - skip for IP-only access
  name: "app.example.com"
  email: "admin@example.com"  # For Let's Encrypt

options:
  createSnapshot: true
  healthCheckRetries: 10
  healthCheckInterval: 5000
  provisioningTimeout: 600000   # 10 minutes
  setupTimeout: 900000          # 15 minutes
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SERVERSGURU_API_KEY` | Your Servers.guru API key | Yes |
| `DOCKER_REGISTRY_USERNAME` | Docker registry username | For private images |
| `DOCKER_REGISTRY_PASSWORD` | Docker registry password/token | For private images |
| `DOCKER_REGISTRY` | Docker registry URL | Optional (default: ghcr.io) |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | Optional (default: info) |

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

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug sg-deploy deploy
```

### Getting Help

- [API Documentation](docs/API.md)
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
