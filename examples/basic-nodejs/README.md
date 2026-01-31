# Basic Node.js Example

This example demonstrates deploying a simple Node.js Express application.

## Files

- `app.js` - Simple Express server
- `Dockerfile` - Container configuration
- `deploy.yaml` - Deployment configuration

## Usage

1. Build the Docker image:
```bash
docker build -t my-node-app:latest .
```

2. Configure deployment:
Edit `deploy.yaml` with your settings.

3. Deploy:
```bash
sg-deploy deploy -c deploy.yaml
```

## Configuration

```yaml
serversGuru:
  apiKey: "${SERVERSGURU_API_KEY}"

vps:
  type: "NL1-2"
  osImage: "ubuntu-22.04"

app:
  name: "nodejs-app"
  dockerImage: "my-node-app:latest"
  port: 3000
  healthEndpoint: "/health"
```
