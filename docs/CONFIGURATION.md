# Configuration Reference

Complete reference for all configuration options in `serversguru-deploy`.

## Table of Contents

- [Configuration File](#configuration-file)
- [ServersGuru Settings](#serversguru-settings)
- [VPS Configuration](#vps-configuration)
- [SSH Configuration](#ssh-configuration)
- [Application Configuration](#application-configuration)
- [Domain Configuration](#domain-configuration)
- [Options](#options)
- [Environment Variables](#environment-variables)
- [VPS Types Reference](#vps-types-reference)
- [OS Images Reference](#os-images-reference)

---

## Configuration File

Configuration can be provided via:

1. **YAML file** (recommended): `deploy.yaml`
2. **Programmatic config**: TypeScript/JavaScript object
3. **CLI arguments**: Override specific values
4. **Environment variables**: Sensitive values

### File Location

By default, `sg-deploy` looks for `deploy.yaml` in the current directory. Override with:

```bash
sg-deploy deploy -c path/to/config.yaml
```

### Environment Variable Interpolation

Use `${VAR_NAME}` syntax to inject environment variables:

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}'

app:
  envVars:
    DATABASE_URL: '${DATABASE_URL}'
```

---

## ServersGuru Settings

API connection configuration.

```yaml
serversGuru:
  apiKey: string # Required - Your API key
  baseUrl?: string # Optional - API base URL (default: https://my.servers.guru/api)
```

### apiKey (required)

Your Servers.guru API key. Get it from [my.servers.guru](https://my.servers.guru).

**Best practice:** Use environment variable:

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}'
```

### baseUrl (optional)

Override the API base URL. Only needed for testing or custom endpoints.

```yaml
serversGuru:
  baseUrl: 'https://api.custom-endpoint.com'
```

---

## VPS Configuration

Server selection and provisioning settings.

```yaml
vps:
  type: string # Required - VPS product type
  osImage: string # Required - Operating system image
  billingCycle?: number # Optional - Billing period in months (1-12, default: 1)
  hostname?: string # Optional - Server hostname
```

### type (required)

VPS product identifier. Run `sg-deploy products` to see available options.

Common types:

| Type  | vCPUs | RAM | Disk  | Monthly |
| ----- | ----- | --- | ----- | ------- |
| NL1-1 | 1     | 1GB | 25GB  | ~€3     |
| NL1-2 | 2     | 2GB | 50GB  | ~€6     |
| NL1-4 | 4     | 4GB | 80GB  | ~€12    |
| NL1-8 | 8     | 8GB | 160GB | ~€24    |

### osImage (required)

Operating system image. Run `sg-deploy images` to see available options.

Recommended images:

| Image          | Description      | Recommended For   |
| -------------- | ---------------- | ----------------- |
| `ubuntu-22.04` | Ubuntu 22.04 LTS | Most deployments  |
| `ubuntu-24.04` | Ubuntu 24.04 LTS | Latest features   |
| `debian-12`    | Debian 12        | Stability-focused |

### billingCycle (optional)

Billing period in months. Longer periods may have discounts.

- `1` - Monthly (default)
- `3` - Quarterly
- `6` - Semi-annual
- `12` - Annual

### hostname (optional)

Server hostname. Used for identification.

```yaml
vps:
  hostname: 'prod-web-1'
```

---

## SSH Configuration

SSH connection settings for server provisioning.

```yaml
ssh:
  port?: number # Optional - SSH port (default: 22)
  username?: string # Optional - SSH username (default: root)
  privateKeyPath?: string # Optional - Path to private SSH key
  connectionTimeout?: number # Optional - Connection timeout in ms (default: 30000)
  commandTimeout?: number # Optional - Command timeout in ms (default: 300000)
```

### port (optional)

SSH port. Default is 22.

```yaml
ssh:
  port: 2222
```

### username (optional)

SSH username. Default is `root` for VPS servers.

```yaml
ssh:
  username: 'admin'
```

### privateKeyPath (optional)

Path to SSH private key for key-based authentication.

```yaml
ssh:
  privateKeyPath: '~/.ssh/id_rsa'
```

**Key format requirements:**

- OpenSSH format (starts with `-----BEGIN OPENSSH PRIVATE KEY-----`)
- PEM format (starts with `-----BEGIN RSA PRIVATE KEY-----`)

**File permissions:**

```bash
chmod 600 ~/.ssh/id_rsa
```

### connectionTimeout (optional)

Maximum time to establish SSH connection in milliseconds.

```yaml
ssh:
  connectionTimeout: 60000 # 60 seconds
```

**Default:** 30000 (30 seconds)

### commandTimeout (optional)

Maximum time for command execution in milliseconds.

```yaml
ssh:
  commandTimeout: 600000 # 10 minutes
```

**Default:** 300000 (5 minutes)

---

## Application Configuration

Docker application deployment settings.

```yaml
app:
  name: string # Required - Application name
  dockerImage: string # Required - Docker image
  port?: number # Optional - Application port (default: 80)
  healthEndpoint?: string # Optional - Health check path (default: /)
  registryAuth?: # Optional - Docker registry credentials
    username: string
    password: string
    registry?: string
  envVars?: Record<string, string> # Optional - Environment variables
  volumes?: string[] # Optional - Volume mounts
  dockerCompose?: object # Optional - Docker Compose services
```

### name (required)

Application name. Used for container naming and identification.

```yaml
app:
  name: 'my-app'
```

**Naming rules:**

- Lowercase letters, numbers, hyphens
- Start with a letter
- No spaces or special characters

### dockerImage (required)

Docker image to deploy.

```yaml
app:
  dockerImage: "nginx:latest"
  # or
  dockerImage: "ghcr.io/user/app:v1.2.3"
```

**Best practices:**

- Use specific version tags, not `latest`
- Use SHA-based tags for reproducibility
- Include full registry path for private images

### port (optional)

Application port inside the container. Nginx will proxy to this port.

```yaml
app:
  port: 3000
```

**Default:** 80

### healthEndpoint (optional)

HTTP path for health checks. Must return HTTP 200 when healthy.

```yaml
app:
  healthEndpoint: '/api/health'
```

**Default:** `/`

### registryAuth (optional)

Credentials for private Docker registries.

```yaml
app:
  registryAuth:
    username: '${DOCKER_REGISTRY_USERNAME}'
    password: '${DOCKER_REGISTRY_PASSWORD}'
    registry: 'ghcr.io'
```

**Supported registries:**

- `ghcr.io` - GitHub Container Registry
- `docker.io` - Docker Hub
- `gcr.io` - Google Container Registry
- `*.azurecr.io` - Azure Container Registry
- Custom private registries

### envVars (optional)

Environment variables passed to the container.

```yaml
app:
  envVars:
    NODE_ENV: 'production'
    DATABASE_URL: '${DATABASE_URL}'
    PORT: '3000'
```

**Notes:**

- Values must be strings (quote numbers)
- Supports `${VAR}` interpolation from host environment
- Sensitive values should use env var interpolation

### volumes (optional)

Docker volume mounts for persistent data.

```yaml
app:
  volumes:
    - './data:/app/data'
    - './logs:/app/logs'
    - 'uploads:/app/uploads' # Named volume
```

**Format:** `host-path:container-path` or `volume-name:container-path`

### dockerCompose (optional)

Additional Docker Compose services to deploy alongside the main app.

```yaml
app:
  dockerCompose:
    version: '3.8'
    services:
      redis:
        image: 'redis:7-alpine'
        restart: unless-stopped
      db:
        image: 'postgres:15-alpine'
        environment:
          POSTGRES_PASSWORD: '${DB_PASSWORD}'
        volumes:
          - 'postgres_data:/var/lib/postgresql/data'
    volumes:
      postgres_data:
```

---

## Domain Configuration

Domain and SSL certificate settings.

```yaml
domain:
  name: string # Required - Domain name
  email: string # Required - Email for Let's Encrypt
```

**Note:** Omit the entire `domain` section to skip SSL setup and use IP-only access.

### name (required)

Domain name pointing to the server IP.

```yaml
domain:
  name: 'app.example.com'
```

**Requirements:**

- DNS A record must point to server IP
- Allow 5-60 minutes for DNS propagation
- Subdomain or apex domain supported

### email (required)

Email for Let's Encrypt registration and expiry notifications.

```yaml
domain:
  email: 'admin@example.com'
```

---

## Options

Deployment behavior configuration.

```yaml
options:
  createSnapshot?: boolean # Create snapshot after deployment (default: true)
  healthCheckRetries?: number # Health check retry count (default: 10)
  healthCheckInterval?: number # Time between health checks in ms (default: 5000)
  provisioningTimeout?: number # VPS provisioning timeout in ms (default: 600000)
  setupTimeout?: number # Server setup timeout in ms (default: 900000)
```

### createSnapshot (optional)

Create a snapshot after successful deployment for rollback.

```yaml
options:
  createSnapshot: true
```

**Default:** `true`

### healthCheckRetries (optional)

Number of health check attempts before failing.

```yaml
options:
  healthCheckRetries: 20
```

**Default:** 10

**Recommendation:** Increase for:

- Applications with slow startup
- Multi-container deployments
- Database migrations on start

### healthCheckInterval (optional)

Time between health check attempts in milliseconds.

```yaml
options:
  healthCheckInterval: 10000 # 10 seconds
```

**Default:** 5000 (5 seconds)

### provisioningTimeout (optional)

Maximum time to wait for VPS to be ready in milliseconds.

```yaml
options:
  provisioningTimeout: 900000 # 15 minutes
```

**Default:** 600000 (10 minutes)

### setupTimeout (optional)

Maximum time for server setup (Docker install, app deployment) in milliseconds.

```yaml
options:
  setupTimeout: 1200000 # 20 minutes
```

**Default:** 900000 (15 minutes)

---

## Environment Variables

Environment variables that affect `sg-deploy` behavior.

### Required

| Variable              | Description               |
| --------------------- | ------------------------- |
| `SERVERSGURU_API_KEY` | Your Servers.guru API key |

### Optional

| Variable                   | Description                              | Default |
| -------------------------- | ---------------------------------------- | ------- |
| `DOCKER_REGISTRY_USERNAME` | Docker registry username                 | -       |
| `DOCKER_REGISTRY_PASSWORD` | Docker registry password                 | -       |
| `DOCKER_REGISTRY`          | Docker registry URL                      | ghcr.io |
| `LOG_LEVEL`                | Logging level (debug, info, warn, error) | info    |

### Setting Environment Variables

**Bash/Zsh:**

```bash
export SERVERSGURU_API_KEY="your-key"
export DOCKER_REGISTRY_USERNAME="username"
export DOCKER_REGISTRY_PASSWORD="token"
```

**In scripts:**

```bash
SERVERSGURU_API_KEY="your-key" sg-deploy deploy
```

**In CI/CD:**
Use your platform's secrets management (GitHub Secrets, GitLab CI Variables, etc.)

---

## VPS Types Reference

Available VPS products. Run `sg-deploy products` for current pricing and availability.

### Netherlands (NL) Location

| Type   | vCPUs | RAM  | SSD   | Bandwidth | Use Case                     |
| ------ | ----- | ---- | ----- | --------- | ---------------------------- |
| NL1-1  | 1     | 1GB  | 25GB  | 1TB       | Static sites, testing        |
| NL1-2  | 2     | 2GB  | 50GB  | 2TB       | Small apps, APIs             |
| NL1-4  | 4     | 4GB  | 80GB  | 3TB       | Medium apps, small databases |
| NL1-8  | 8     | 8GB  | 160GB | 4TB       | Large apps, multi-container  |
| NL1-16 | 16    | 16GB | 320GB | 5TB       | High-traffic, production     |

### Selecting the Right VPS

| Application Type    | Recommended    | Why                      |
| ------------------- | -------------- | ------------------------ |
| Static site (Nginx) | NL1-1          | Minimal resources needed |
| Node.js API         | NL1-2          | 2GB RAM for Node.js      |
| Next.js / Nuxt      | NL1-2 or NL1-4 | SSR requires more RAM    |
| WordPress           | NL1-2          | PHP + MySQL              |
| Django + PostgreSQL | NL1-4          | Database needs RAM       |
| Multi-container     | NL1-4+         | Multiple services        |

---

## OS Images Reference

Available operating system images. Run `sg-deploy images` for current options.

### Recommended Images

| Image          | Version   | Support Until | Best For         |
| -------------- | --------- | ------------- | ---------------- |
| `ubuntu-22.04` | 22.04 LTS | April 2027    | Most deployments |
| `ubuntu-24.04` | 24.04 LTS | April 2029    | Latest features  |
| `debian-12`    | Bookworm  | ~2028         | Stability        |
| `debian-11`    | Bullseye  | ~2026         | Compatibility    |

### Image Features

All images include:

- Docker pre-installation support
- SSH server
- Firewall (UFW for Ubuntu, iptables for Debian)
- Automatic security updates

### Choosing an Image

**Ubuntu 22.04 (recommended):**

- Most documentation and tutorials
- Wide package availability
- LTS with 5 years support

**Ubuntu 24.04:**

- Newer packages
- Latest kernel
- Good for new projects

**Debian 12:**

- More conservative updates
- Preferred for critical systems
- Slightly smaller footprint

---

## Complete Example

Full configuration with all options:

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}'

vps:
  type: 'NL1-4'
  osImage: 'ubuntu-22.04'
  billingCycle: 1
  hostname: 'production-web'

ssh:
  port: 22
  username: root
  connectionTimeout: 60000
  commandTimeout: 600000

app:
  name: 'my-app'
  dockerImage: 'ghcr.io/myorg/my-app:v1.0.0'
  port: 3000
  healthEndpoint: '/api/health'
  registryAuth:
    username: '${DOCKER_REGISTRY_USERNAME}'
    password: '${DOCKER_REGISTRY_PASSWORD}'
    registry: ghcr.io
  envVars:
    NODE_ENV: 'production'
    DATABASE_URL: '${DATABASE_URL}'
    REDIS_URL: 'redis://redis:6379'
  volumes:
    - 'uploads:/app/uploads'
  dockerCompose:
    version: '3.8'
    services:
      redis:
        image: 'redis:7-alpine'
        restart: unless-stopped

domain:
  name: 'app.example.com'
  email: 'admin@example.com'

options:
  createSnapshot: true
  healthCheckRetries: 15
  healthCheckInterval: 5000
  provisioningTimeout: 600000
  setupTimeout: 900000
```
