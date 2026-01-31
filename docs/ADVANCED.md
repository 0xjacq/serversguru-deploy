# Advanced Usage Guide

Advanced patterns and techniques for deploying with `serversguru-deploy`.

## Table of Contents

- [Deploying to Existing VPS](#deploying-to-existing-vps)
- [Rollback Procedures](#rollback-procedures)
- [Blue-Green Deployments](#blue-green-deployments)
- [Staging and Production Environments](#staging-and-production-environments)
- [Secrets Management](#secrets-management)
- [Custom Templates](#custom-templates)
- [Performance Optimization](#performance-optimization)
- [Monitoring Integration](#monitoring-integration)

---

## Deploying to Existing VPS

Skip VPS ordering and deploy directly to an existing server.

### CLI Method

```bash
sg-deploy deploy \
  -c deploy.yaml \
  --server-id 12345 \
  --server-ip 192.168.1.100 \
  --password "server-password"
```

### Programmatic Method

```typescript
import { DeploymentOrchestrator, DeploymentConfigSchema } from 'serversguru-deploy';

const config = DeploymentConfigSchema.parse({
  serversGuru: { apiKey: process.env.SERVERSGURU_API_KEY },
  vps: { type: 'NL1-2', osImage: 'ubuntu-22.04' },
  app: {
    name: 'my-app',
    dockerImage: 'nginx:latest',
    port: 80,
  },
});

const orchestrator = new DeploymentOrchestrator(config);

// Deploy to existing server (skips order/provisioning steps)
const result = await orchestrator.deployToExisting(
  12345, // serverId
  '192.168.1.100', // serverIp
  'server-password' // password
);
```

### When to Use

- **Redeploying** after code changes
- **Multiple apps** on one server
- **Server already provisioned** by another process
- **Testing** without ordering new servers

### Workflow: Update Existing Deployment

1. Build and push new Docker image
2. Deploy to existing server
3. Health check verifies new version
4. Create snapshot of working state

```bash
# Build and push new version
docker build -t ghcr.io/user/app:v2.0.0 .
docker push ghcr.io/user/app:v2.0.0

# Update deploy.yaml with new image tag
# Then redeploy to existing server
sg-deploy deploy \
  --server-id 12345 \
  --server-ip 1.2.3.4 \
  --password "$SERVER_PASSWORD"
```

---

## Rollback Procedures

Restore a server to a previous snapshot.

### Prerequisites

- Snapshots enabled (`options.createSnapshot: true`)
- At least one snapshot exists

### List Available Snapshots

```bash
sg-deploy snapshots --server-id 12345
```

Output:

```
ID      NAME                          CREATED             SIZE
789     pre-deploy-2024-01-15-10:30   2024-01-15 10:30    5.2GB
790     pre-deploy-2024-01-16-14:45   2024-01-16 14:45    5.3GB
```

### Perform Rollback

```bash
sg-deploy rollback --server-id 12345 --snapshot-id 789
```

### Programmatic Rollback

```typescript
import { DeploymentOrchestrator } from 'serversguru-deploy';

const orchestrator = new DeploymentOrchestrator(config);

// Rollback to specific snapshot
await orchestrator.rollback(789);

console.log('Rollback complete');
```

### Rollback Strategy

1. **Identify the issue** - Check logs, health endpoints
2. **List snapshots** - Find the last known good state
3. **Notify stakeholders** - Inform team of rollback
4. **Execute rollback** - Restore snapshot
5. **Verify** - Check application health
6. **Investigate** - Debug the failed deployment

### Automatic Rollback on Failure

```typescript
const orchestrator = new DeploymentOrchestrator(config);

try {
  const result = await orchestrator.deploy();

  if (!result.success) {
    // Deployment failed - rollback
    const snapshots = await client.listSnapshots(result.serverId);
    if (snapshots.length > 0) {
      await orchestrator.rollback(snapshots[0].id);
      console.log('Rolled back to previous version');
    }
  }
} catch (error) {
  console.error('Deployment failed:', error);
}
```

---

## Blue-Green Deployments

Zero-downtime deployments using two identical environments.

### Concept

```
                    Load Balancer / DNS
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │  Blue    │              │  Green   │
        │ (Active) │              │ (Standby)│
        │ v1.0.0   │              │ v1.1.0   │
        └──────────┘              └──────────┘
```

### Implementation

**1. Deploy to standby (green) environment:**

```bash
# deploy-green.yaml
sg-deploy deploy -c deploy-green.yaml
```

**2. Test green environment:**

```bash
curl https://green.example.com/health
```

**3. Switch traffic (update DNS or load balancer):**

```bash
# Update DNS to point to green server IP
# Or update load balancer target
```

**4. Monitor:**

```bash
# Watch error rates, response times
```

**5. If issues, rollback by switching DNS back:**

```bash
# Point DNS back to blue server IP
```

### Configuration Files

**deploy-blue.yaml:**

```yaml
vps:
  hostname: 'blue-production'
domain:
  name: 'blue.example.com'
```

**deploy-green.yaml:**

```yaml
vps:
  hostname: 'green-production'
domain:
  name: 'green.example.com'
```

### DNS-Based Switching

Use low TTL DNS records for quick switching:

```
; Before deployment
app.example.com.  60  IN  A  1.1.1.1  ; blue

; After verified deployment
app.example.com.  60  IN  A  2.2.2.2  ; green
```

---

## Staging and Production Environments

Manage multiple environments with configuration inheritance.

### Directory Structure

```
deployments/
├── base.yaml           # Shared configuration
├── staging.yaml        # Staging overrides
└── production.yaml     # Production overrides
```

### Base Configuration

**base.yaml:**

```yaml
vps:
  osImage: 'ubuntu-22.04'

ssh:
  port: 22
  username: root
  connectionTimeout: 30000

app:
  name: 'myapp'
  port: 3000
  healthEndpoint: '/health'

options:
  createSnapshot: true
  healthCheckRetries: 10
```

### Staging Configuration

**staging.yaml:**

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}'

vps:
  type: 'NL1-2'
  hostname: 'staging'

app:
  dockerImage: 'ghcr.io/org/app:staging'
  envVars:
    NODE_ENV: 'staging'
    LOG_LEVEL: 'debug'

domain:
  name: 'staging.example.com'
  email: 'devops@example.com'
```

### Production Configuration

**production.yaml:**

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}'

vps:
  type: 'NL1-8'
  billingCycle: 12
  hostname: 'production'

app:
  dockerImage: 'ghcr.io/org/app:${VERSION}'
  envVars:
    NODE_ENV: 'production'
    LOG_LEVEL: 'info'

domain:
  name: 'app.example.com'
  email: 'devops@example.com'

options:
  healthCheckRetries: 20
  setupTimeout: 1200000
```

### Deployment Script

```bash
#!/bin/bash
set -e

ENVIRONMENT=${1:-staging}

case $ENVIRONMENT in
  staging)
    sg-deploy deploy -c staging.yaml
    ;;
  production)
    echo "Deploying to production..."
    read -p "Are you sure? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      sg-deploy deploy -c production.yaml
    fi
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac
```

### Environment Promotion

```bash
# Deploy to staging
./deploy.sh staging

# Test staging
curl https://staging.example.com/health

# Promote to production
./deploy.sh production
```

---

## Secrets Management

Secure handling of sensitive configuration values.

### Environment Variables (Basic)

```bash
export DATABASE_URL="postgresql://user:password@host:5432/db"
export API_SECRET="super-secret-key"
```

```yaml
app:
  envVars:
    DATABASE_URL: '${DATABASE_URL}'
    API_SECRET: '${API_SECRET}'
```

### Using dotenv Files

**.env.staging:**

```
DATABASE_URL=postgresql://staging-user:pass@staging-db:5432/app
REDIS_URL=redis://staging-redis:6379
```

**.env.production:**

```
DATABASE_URL=postgresql://prod-user:pass@prod-db:5432/app
REDIS_URL=redis://prod-redis:6379
```

**Usage:**

```bash
# Load environment and deploy
source .env.staging && sg-deploy deploy -c staging.yaml
```

### Secret Management Services

For production, use dedicated secret managers:

**AWS Secrets Manager:**

```bash
# Fetch secrets before deployment
export DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id prod/database-url \
  --query SecretString --output text)
```

**HashiCorp Vault:**

```bash
export DATABASE_URL=$(vault kv get -field=url secret/database)
```

**1Password CLI:**

```bash
export DATABASE_URL=$(op read "op://Production/Database/url")
```

### CI/CD Integration

**GitHub Actions:**

```yaml
- name: Deploy
  env:
    SERVERSGURU_API_KEY: ${{ secrets.SERVERSGURU_API_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: sg-deploy deploy -c deploy.yaml
```

### Security Best Practices

1. **Never commit secrets** to version control
2. **Use environment variables** for sensitive values
3. **Rotate secrets regularly** especially after incidents
4. **Audit access** to secret management systems
5. **Use least privilege** - each environment has its own credentials

---

## Custom Templates

Customize server setup and Nginx configuration.

### Available Templates

- `SETUP_SCRIPT` - Server initialization script
- `DOCKER_COMPOSE_TEMPLATE` - Docker Compose file template
- `NGINX_CONFIG_TEMPLATE` - Nginx reverse proxy configuration

### Using Custom Nginx Configuration

```typescript
import { DeploymentOrchestrator, renderTemplate } from 'serversguru-deploy';

const customNginxTemplate = `
server {
    listen 80;
    server_name {{DOMAIN}};

    # Custom headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Custom rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    location /api {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:{{APP_PORT}};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:{{APP_PORT}};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`;

// Render template with variables
const nginxConfig = renderTemplate(customNginxTemplate, {
  DOMAIN: 'app.example.com',
  APP_PORT: '3000',
});
```

### Custom Setup Scripts

```typescript
const customSetupScript = `
#!/bin/bash
set -e

# Install additional packages
apt-get update
apt-get install -y htop nethogs

# Configure swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Custom firewall rules
ufw allow 8080/tcp

echo "Custom setup complete"
`;
```

### Template Variables

| Variable        | Description       |
| --------------- | ----------------- |
| `{{APP_NAME}}`  | Application name  |
| `{{APP_PORT}}`  | Application port  |
| `{{DOMAIN}}`    | Domain name       |
| `{{SERVER_IP}}` | Server IP address |

---

## Performance Optimization

Optimize deployments and application performance.

### Faster Deployments

**Pre-pull Docker images:**

```yaml
# Use digest-based image references for caching
app:
  dockerImage: 'ghcr.io/org/app@sha256:abc123...'
```

**Increase timeouts for large images:**

```yaml
ssh:
  commandTimeout: 900000 # 15 minutes
```

### Application Optimization

**Enable gzip in Nginx:**

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;
```

**Container resource limits:**

```yaml
app:
  envVars:
    NODE_OPTIONS: '--max-old-space-size=1536'
```

### Caching Strategies

**Redis for session/cache:**

```yaml
app:
  dockerCompose:
    services:
      redis:
        image: 'redis:7-alpine'
        command: ['redis-server', '--maxmemory', '256mb', '--maxmemory-policy', 'allkeys-lru']
```

**CDN integration:**

- Point CDN to your domain
- Configure cache headers in your app
- Use separate subdomain for static assets

### VPS Selection for Performance

| Workload         | Recommended VPS | Reason               |
| ---------------- | --------------- | -------------------- |
| CPU-intensive    | NL1-8 or higher | More vCPUs           |
| Memory-intensive | NL1-8+          | 8GB+ RAM             |
| I/O-intensive    | Any with SSD    | All VPS use SSD      |
| High traffic     | NL1-8+ with CDN | CDN offloads traffic |

---

## Monitoring Integration

Set up monitoring for deployed applications.

### Health Check Endpoint

Implement a comprehensive health endpoint:

```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {},
  };

  // Database check
  try {
    await db.query('SELECT 1');
    health.checks.database = 'healthy';
  } catch (e) {
    health.checks.database = 'unhealthy';
    health.status = 'unhealthy';
  }

  // Redis check
  try {
    await redis.ping();
    health.checks.redis = 'healthy';
  } catch (e) {
    health.checks.redis = 'unhealthy';
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### External Monitoring Services

**UptimeRobot:**

- Monitor health endpoint
- Alert on downtime
- Free tier available

**Better Uptime:**

- Status pages
- Incident management
- On-call scheduling

### Log Aggregation

**Forward logs to external service:**

```yaml
app:
  envVars:
    LOGDNA_KEY: '${LOGDNA_KEY}'
    PAPERTRAIL_HOST: 'logs.papertrailapp.com'
    PAPERTRAIL_PORT: '12345'
```

**Docker logging drivers:**

```yaml
app:
  dockerCompose:
    services:
      web:
        logging:
          driver: 'syslog'
          options:
            syslog-address: 'udp://logs.example.com:514'
```

### Metrics Collection

**Prometheus metrics endpoint:**

```javascript
const promClient = require('prom-client');
promClient.collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

**Grafana Cloud integration:**

- Install Grafana Agent on server
- Configure to scrape `/metrics`
- Visualize in Grafana dashboards

### Alerting

Configure alerts for:

- Health check failures
- High error rates (5xx responses)
- High response times (> 2s)
- High CPU/memory usage
- Disk space low (< 20%)

Example alert rule (Prometheus):

```yaml
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: 'High error rate detected'
```
