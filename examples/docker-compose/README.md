# Docker Compose Multi-Container Example

This example demonstrates deploying a multi-container application with Docker Compose, including a web app, Redis cache, and PostgreSQL database.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Nginx Proxy                    │
│              (SSL termination)                   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│                  Web App                         │
│              (Node.js/Express)                   │
│                 Port 3000                        │
└─────────┬───────────────────────┬───────────────┘
          │                       │
┌─────────▼─────────┐   ┌────────▼────────┐
│      Redis        │   │   PostgreSQL    │
│    Port 6379      │   │   Port 5432     │
└───────────────────┘   └─────────────────┘
```

## Files

- `docker-compose.yml` - Multi-container orchestration
- `Dockerfile` - Application container
- `deploy.yaml` - Deployment configuration
- `app.js` - Sample Express application

## Prerequisites

- Docker and Docker Compose installed locally
- Servers.guru API key
- A domain name (for SSL)

## Usage

### 1. Test locally

```bash
docker-compose up -d
curl http://localhost:3000/health
```

### 2. Build and push the app image

```bash
docker build -t ghcr.io/your-username/myapp:latest .
docker push ghcr.io/your-username/myapp:latest
```

### 3. Configure deployment

Edit `deploy.yaml`:

- Set your Docker registry credentials
- Set database password
- Configure your domain

### 4. Set environment variables

```bash
export SERVERSGURU_API_KEY="your-api-key"
export DOCKER_REGISTRY_USERNAME="your-username"
export DOCKER_REGISTRY_PASSWORD="your-token"
export DATABASE_PASSWORD="secure-password"
```

### 5. Deploy

```bash
sg-deploy deploy -c deploy.yaml
```

## How It Works

The deployment:

1. **Orders a VPS** with Ubuntu 22.04
2. **Sets up Docker** and Docker Compose
3. **Creates docker-compose.yml** on the server with:
   - Your application container
   - Redis container (for caching/sessions)
   - PostgreSQL container (for data persistence)
4. **Configures Nginx** as reverse proxy with SSL
5. **Runs health checks** to verify the stack is working

## Configuration Details

### Services

| Service | Image              | Port | Purpose           |
| ------- | ------------------ | ---- | ----------------- |
| web     | Your app           | 3000 | Main application  |
| redis   | redis:7-alpine     | 6379 | Caching, sessions |
| db      | postgres:15-alpine | 5432 | Data persistence  |

### Volumes

Data is persisted in Docker volumes:

- `postgres_data` - Database files
- `redis_data` - Redis persistence (if configured)

### Networks

All containers run on a private `app-network` for inter-service communication.

## Environment Variables

| Variable       | Description                  | Required |
| -------------- | ---------------------------- | -------- |
| `DATABASE_URL` | PostgreSQL connection string | Yes      |
| `REDIS_URL`    | Redis connection string      | Yes      |
| `NODE_ENV`     | Environment (production)     | Yes      |

## Customization

### Adding more services

Edit the `dockerCompose` section in deploy.yaml:

```yaml
app:
  dockerCompose:
    services:
      # Add a worker service
      worker:
        image: ghcr.io/your-username/myapp:latest
        command: ['npm', 'run', 'worker']
        depends_on:
          - redis
          - db
```

### Scaling web containers

For high availability, you can run multiple web containers:

```yaml
services:
  web:
    deploy:
      replicas: 3
```

### Using external databases

For production, consider using managed databases:

```yaml
app:
  envVars:
    DATABASE_URL: 'postgresql://user:pass@managed-db.example.com:5432/app'
```

And remove the `db` service from docker-compose.

## Troubleshooting

### Database connection refused

1. Wait for PostgreSQL to initialize (can take 30-60 seconds)
2. Check container logs: `docker logs db`
3. Verify the DATABASE_URL is correct

### Redis connection error

1. Ensure Redis container is running: `docker ps`
2. Check Redis logs: `docker logs redis`

### Container keeps restarting

1. Check logs: `docker logs web`
2. Verify all environment variables are set
3. Ensure database migrations have run

### Out of disk space

PostgreSQL and Redis can grow. Monitor with:

```bash
docker system df
```

Clean up with:

```bash
docker system prune -a
```

## Security Notes

- Database passwords are set via environment variables
- All inter-service communication is on a private network
- Only the web service is exposed via Nginx
- SSL is automatically configured via Let's Encrypt
