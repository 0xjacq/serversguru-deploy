/**
 * Server setup script template
 *
 * Variables:
 * - ${APP_USER}: Application user to create
 * - ${SSH_PUBLIC_KEY}: Optional SSH public key for future access
 */
export const SETUP_SCRIPT = `#!/bin/bash
set -euo pipefail

echo "=== Server Setup Script ==="
echo "Started at: $(date)"

# Update system
echo "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install essential packages
echo "Installing essential packages..."
apt-get install -y -qq \\
    apt-transport-https \\
    ca-certificates \\
    curl \\
    gnupg \\
    lsb-release \\
    software-properties-common \\
    ufw \\
    fail2ban \\
    htop \\
    git

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin
echo "Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
    apt-get install -y -qq docker-compose-plugin
fi

# Install Nginx
echo "Installing Nginx..."
apt-get install -y -qq nginx
systemctl enable nginx

# Install Certbot
echo "Installing Certbot..."
apt-get install -y -qq certbot python3-certbot-nginx

# Configure firewall
echo "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Create app user if specified
if [ -n "\${APP_USER:-}" ]; then
    echo "Creating application user: \${APP_USER}"
    if ! id "\${APP_USER}" &>/dev/null; then
        useradd -m -s /bin/bash "\${APP_USER}"
        usermod -aG docker "\${APP_USER}"
    fi
fi

# Setup SSH key if provided
if [ -n "\${SSH_PUBLIC_KEY:-}" ]; then
    echo "Setting up SSH key..."
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    echo "\${SSH_PUBLIC_KEY}" >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

# Create deployment directory
echo "Creating deployment directory..."
mkdir -p /opt/app
chmod 755 /opt/app

# Configure fail2ban
echo "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo "=== Setup Complete ==="
echo "Finished at: $(date)"
`;

/**
 * Docker Compose template
 *
 * Variables:
 * - ${APP_NAME}: Application name
 * - ${DOCKER_IMAGE}: Docker image to deploy
 * - ${APP_PORT}: Application port
 * - ${VOLUMES}: Volume mounts (optional)
 */
export const DOCKER_COMPOSE_TEMPLATE = `version: '3.8'

services:
  \${APP_NAME}:
    image: \${DOCKER_IMAGE}
    container_name: \${APP_NAME}
    restart: unless-stopped
    ports:
      - "127.0.0.1:\${APP_PORT}:\${APP_PORT}"
    environment:
      - NODE_ENV=production
      - PORT=\${APP_PORT}
\${ENV_VARS}
    volumes:
      - app_data:/app/data
\${VOLUMES}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:\${APP_PORT}\${HEALTH_ENDPOINT}"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  app_data:
`;

/**
 * Nginx site configuration template
 *
 * Variables:
 * - ${DOMAIN}: Domain name
 * - ${APP_PORT}: Application port
 */
export const NGINX_CONFIG_TEMPLATE = `server {
    listen 80;
    listen [::]:80;
    server_name \${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:\${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:\${APP_PORT}/api/status;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
`;

/**
 * Nginx configuration for IP-only access (no domain)
 *
 * Variables:
 * - ${APP_PORT}: Application port
 */
export const NGINX_IP_CONFIG_TEMPLATE = `server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:\${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
`;

/**
 * Environment file template generator
 */
export function generateEnvFile(envVars: Record<string, string>): string {
  return Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/**
 * Generate docker-compose environment section
 */
export function generateEnvSection(envVars: Record<string, string>): string {
  if (Object.keys(envVars).length === 0) {
    return '';
  }
  return Object.keys(envVars)
    .map((key) => `      - ${key}=\${${key}}`)
    .join('\n');
}

/**
 * Generate docker-compose volumes section
 */
export function generateVolumesSection(volumes: string[]): string {
  if (volumes.length === 0) {
    return '';
  }
  return volumes.map((v) => `      - ${v}`).join('\n');
}

/**
 * Template variable substitution
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    // Support both ${VAR} and {{VAR}} syntax
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}
