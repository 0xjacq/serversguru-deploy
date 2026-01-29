#!/bin/bash
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
apt-get install -y -qq \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
    ufw \
    fail2ban \
    htop \
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
if [ -n "${APP_USER:-}" ]; then
    echo "Creating application user: ${APP_USER}"
    if ! id "${APP_USER}" &>/dev/null; then
        useradd -m -s /bin/bash "${APP_USER}"
        usermod -aG docker "${APP_USER}"
    fi
fi

# Setup SSH key if provided
if [ -n "${SSH_PUBLIC_KEY:-}" ]; then
    echo "Setting up SSH key..."
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    echo "${SSH_PUBLIC_KEY}" >> /root/.ssh/authorized_keys
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
