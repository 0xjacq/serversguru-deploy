# Next.js Example

This example demonstrates deploying a Next.js application with custom domain and SSL.

## Files

- `package.json` - Next.js dependencies
- `next.config.js` - Next.js configuration
- `Dockerfile` - Multi-stage production build
- `deploy.yaml` - Deployment configuration

## Prerequisites

- Node.js 18+
- Docker installed locally
- A domain name pointing to your server IP (for SSL)
- Servers.guru API key

## Usage

### 1. Build the Docker image

```bash
docker build -t my-nextjs-app:latest .
```

### 2. Push to a container registry

```bash
# For GitHub Container Registry
docker tag my-nextjs-app:latest ghcr.io/your-username/my-nextjs-app:latest
docker push ghcr.io/your-username/my-nextjs-app:latest
```

### 3. Configure deployment

Edit `deploy.yaml`:

```yaml
serversGuru:
  apiKey: '${SERVERSGURU_API_KEY}'

app:
  dockerImage: 'ghcr.io/your-username/my-nextjs-app:latest'

domain:
  name: 'your-domain.com'
  email: 'your-email@example.com'
```

### 4. Set environment variables

```bash
export SERVERSGURU_API_KEY="your-api-key"

# If using private registry
export DOCKER_REGISTRY_USERNAME="your-username"
export DOCKER_REGISTRY_PASSWORD="your-token"
```

### 5. Deploy

```bash
# Dry run first
sg-deploy deploy -c deploy.yaml --dry-run

# Deploy
sg-deploy deploy -c deploy.yaml
```

## Configuration Details

### VPS Selection

The example uses `NL1-2` which provides:

- 2 vCPUs
- 4GB RAM
- 80GB SSD
- Suitable for small to medium Next.js apps

For larger applications, consider `NL1-4` or higher.

### Health Endpoint

The configuration uses `/api/health` as the health endpoint. The example app includes this endpoint at `pages/api/health.js`.

### Environment Variables

The deployment sets:

- `NODE_ENV=production` - Production mode
- `NEXT_TELEMETRY_DISABLED=1` - Disable Next.js telemetry

Add your own environment variables in the `envVars` section.

## Customization

### Adding Environment Variables

```yaml
app:
  envVars:
    DATABASE_URL: '${DATABASE_URL}'
    NEXT_PUBLIC_API_URL: 'https://api.example.com'
```

### Using a Different VPS Type

```yaml
vps:
  type: 'NL1-4' # 4 vCPUs, 8GB RAM
```

### Without SSL (IP only)

Remove the `domain` section:

```yaml
# domain:
#   name: "app.example.com"
#   email: "admin@example.com"
```

## Troubleshooting

### Build fails with memory error

Next.js builds can be memory-intensive. The Dockerfile sets `NODE_OPTIONS=--max_old_space_size=4096`. If you still have issues, use a larger VPS type.

### Health check fails

1. Ensure the `/api/health` endpoint exists and returns 200
2. Check container logs: `ssh root@<ip> "docker logs nextjs-app"`
3. Verify the app is running on port 3000

### SSL certificate fails

1. Ensure DNS is configured and propagated
2. Verify port 80 is accessible for ACME challenge
3. Check Let's Encrypt rate limits (5 certificates per domain per week)
