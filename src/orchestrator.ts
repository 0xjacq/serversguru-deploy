import { ServersGuruClient, ServersGuruApiError } from './api/servers-guru.js';
import { SshProvisioner } from './ssh/provisioner.js';
import {
  SETUP_SCRIPT,
  DOCKER_COMPOSE_TEMPLATE,
  NGINX_CONFIG_TEMPLATE,
  NGINX_IP_CONFIG_TEMPLATE,
  generateEnvFile,
  generateEnvSection,
  generateVolumesSection,
  renderTemplate,
} from './templates/index.js';
import type {
  DeploymentConfig,
  DeploymentResult,
  ServerInfo,
  DeploymentStep,
  ProgressCallback,
  Snapshot,
} from './config.js';

/**
 * Deployment Orchestrator
 *
 * Manages the complete deployment pipeline from VPS provisioning
 * through application deployment and health verification.
 */
export class DeploymentOrchestrator {
  private readonly config: DeploymentConfig;
  private readonly apiClient: ServersGuruClient;
  private readonly ssh: SshProvisioner;
  private onProgress?: ProgressCallback;

  // Deployment state
  private serverId?: number;
  private serverIp?: string;
  private serverPassword?: string;
  private snapshotId?: number;
  private logs: string[] = [];
  private errors: string[] = [];

  constructor(config: DeploymentConfig) {
    this.config = config;
    this.apiClient = new ServersGuruClient(config.serversGuru);
    this.ssh = new SshProvisioner(config.ssh);
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] ${message}`);
  }

  /**
   * Report progress
   */
  private progress(step: DeploymentStep, message: string, progress?: number): void {
    this.log(`[${step}] ${message}`);
    this.onProgress?.(step, message, progress);
  }

  /**
   * Execute the full deployment pipeline
   */
  async deploy(): Promise<DeploymentResult> {
    const startTime = new Date();

    try {
      // Step 1: Check balance
      await this.checkBalance();

      // Step 2: Order VPS
      await this.orderVps();

      // Step 3: Wait for provisioning
      await this.waitForProvisioning();

      // Step 4: Wait for SSH
      await this.waitForSsh();

      // Step 5: Setup server
      await this.setupServer();

      // Step 6: Deploy application
      await this.deployApplication();

      // Step 7: Configure Nginx
      await this.configureNginx();

      // Step 8: Obtain SSL (if domain configured)
      if (this.config.domain) {
        await this.obtainSsl();
      }

      // Step 9: Health check
      const healthCheckPassed = await this.verifyHealth();

      // Step 10: Create snapshot (if enabled and healthy)
      if (this.config.options.createSnapshot && healthCheckPassed) {
        await this.createSuccessSnapshot();
      }

      this.progress('complete', 'Deployment completed successfully');

      return {
        success: true,
        serverId: this.serverId!,
        serverIp: this.serverIp!,
        snapshotId: this.snapshotId,
        healthCheckPassed,
        deployedAt: startTime.toISOString(),
        appUrl: this.config.domain
          ? `https://${this.config.domain.name}`
          : `http://${this.serverIp}`,
        errors: this.errors,
        logs: this.logs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(errorMessage);
      this.log(`Deployment failed: ${errorMessage}`);

      return {
        success: false,
        serverId: this.serverId ?? 0,
        serverIp: this.serverIp ?? '',
        snapshotId: this.snapshotId,
        healthCheckPassed: false,
        deployedAt: startTime.toISOString(),
        errors: this.errors,
        logs: this.logs,
      };
    } finally {
      await this.ssh.disconnect();
    }
  }

  /**
   * Step 1: Check account balance
   */
  private async checkBalance(): Promise<void> {
    this.progress('check-balance', 'Checking account balance...');
    const balance = await this.apiClient.getBalance();
    this.log(`Current balance: ${balance}`);

    if (balance <= 0) {
      throw new Error('Insufficient account balance');
    }
  }

  /**
   * Step 2: Order VPS
   */
  private async orderVps(): Promise<void> {
    this.progress('order-vps', `Ordering VPS: ${this.config.vps.type}...`);

    const result = await this.apiClient.orderVps({
      vpsType: this.config.vps.type,
      osImage: this.config.vps.osImage,
      billingCycle: this.config.vps.billingCycle,
      hostname: this.config.vps.hostname ?? this.config.app.name,
    });

    this.serverId = result.serverId;
    this.serverIp = result.ipv4;
    this.serverPassword = result.password;

    this.log(`VPS ordered: ID=${result.serverId}, IP=${result.ipv4}`);
  }

  /**
   * Step 3: Wait for provisioning to complete
   */
  private async waitForProvisioning(): Promise<void> {
    this.progress('wait-provisioning', 'Waiting for VPS provisioning...');

    await this.apiClient.waitForStatus(this.serverId!, 'running', {
      timeout: this.config.options.provisioningTimeout,
      pollInterval: 10000,
      onProgress: (status) => {
        this.log(`Server status: ${status}`);
      },
    });

    this.log('VPS is now running');
  }

  /**
   * Step 4: Wait for SSH to become available
   */
  private async waitForSsh(): Promise<void> {
    this.progress('wait-ssh', 'Waiting for SSH availability...');

    await SshProvisioner.waitForSsh(this.serverIp!, {
      port: this.config.ssh.port,
      timeout: 120000, // 2 minutes for SSH
      retryInterval: 5000,
      onRetry: (attempt, error) => {
        this.log(`SSH attempt ${attempt} failed: ${error}`);
      },
    });

    // Connect to server
    await this.ssh.connect({
      host: this.serverIp!,
      port: this.config.ssh.port,
      username: this.config.ssh.username,
      password: this.serverPassword,
    });

    this.log('SSH connection established');
  }

  /**
   * Step 5: Setup server (Docker, Nginx, firewall)
   */
  private async setupServer(): Promise<void> {
    this.progress('setup-server', 'Setting up server...');

    // Upload and run setup script
    const setupScript = renderTemplate(SETUP_SCRIPT, {
      APP_USER: 'app',
      SSH_PUBLIC_KEY: '', // Could be configured
    });

    await this.ssh.uploadContent(setupScript, '/tmp/setup.sh');
    await this.ssh.execOrFail('chmod +x /tmp/setup.sh');

    this.log('Running setup script...');
    const result = await this.ssh.exec('/tmp/setup.sh', {
      timeout: this.config.options.setupTimeout,
    });

    if (result.code !== 0) {
      throw new Error(`Setup script failed: ${result.stderr}`);
    }

    this.log('Server setup complete');
  }

  /**
   * Step 6: Deploy application
   */
  private async deployApplication(): Promise<void> {
    this.progress('deploy-application', 'Deploying application...');

    const appDir = '/opt/app';

    // Create app directory
    await this.ssh.execOrFail(`mkdir -p ${appDir}`);

    // Generate docker-compose.yml
    const dockerCompose = renderTemplate(DOCKER_COMPOSE_TEMPLATE, {
      APP_NAME: this.config.app.name,
      DOCKER_IMAGE: this.config.app.dockerImage,
      APP_PORT: this.config.app.port.toString(),
      HEALTH_ENDPOINT: this.config.app.healthEndpoint,
      ENV_VARS: generateEnvSection(this.config.app.envVars),
      VOLUMES: generateVolumesSection(this.config.app.volumes),
    });

    await this.ssh.uploadContent(dockerCompose, `${appDir}/docker-compose.yml`);
    this.log('Uploaded docker-compose.yml');

    // Generate .env file
    const envFile = generateEnvFile(this.config.app.envVars);
    await this.ssh.uploadContent(envFile, `${appDir}/.env`);
    this.log('Uploaded .env file');

    // Login to registry if credentials provided
    if (this.config.app.registryAuth) {
      const { registry, username, password } = this.config.app.registryAuth;
      this.log(`Logging into registry: ${registry}`);
      await this.ssh.execOrFail(
        `echo "${password}" | docker login ${registry} -u "${username}" --password-stdin`
      );
    }

    // Pull image
    this.log(`Pulling image: ${this.config.app.dockerImage}`);
    await this.ssh.execOrFail(`docker pull ${this.config.app.dockerImage}`);

    // Start container
    this.log('Starting container...');
    await this.ssh.execOrFail(`cd ${appDir} && docker compose up -d`);

    // Wait for container to be healthy
    await this.waitForContainerHealth();

    this.log('Application deployed');
  }

  /**
   * Wait for container to report healthy
   */
  private async waitForContainerHealth(): Promise<void> {
    const maxAttempts = 30;
    const interval = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.ssh.exec(
        `docker inspect --format='{{.State.Health.Status}}' ${this.config.app.name} 2>/dev/null || echo "starting"`
      );

      const status = result.stdout.trim();
      this.log(`Container health status: ${status}`);

      if (status === 'healthy') {
        return;
      }

      if (status === 'unhealthy') {
        const logs = await this.ssh.exec(`docker logs ${this.config.app.name} --tail 50`);
        throw new Error(`Container is unhealthy. Logs:\n${logs.stdout}\n${logs.stderr}`);
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    this.log('Container health check timeout - continuing anyway');
  }

  /**
   * Step 7: Configure Nginx
   */
  private async configureNginx(): Promise<void> {
    this.progress('configure-nginx', 'Configuring Nginx...');

    const nginxConfig = this.config.domain
      ? renderTemplate(NGINX_CONFIG_TEMPLATE, {
          DOMAIN: this.config.domain.name,
          APP_PORT: this.config.app.port.toString(),
        })
      : renderTemplate(NGINX_IP_CONFIG_TEMPLATE, {
          APP_PORT: this.config.app.port.toString(),
        });

    const configPath = this.config.domain
      ? `/etc/nginx/sites-available/${this.config.app.name}`
      : '/etc/nginx/sites-available/default';

    await this.ssh.uploadContent(nginxConfig, configPath);

    if (this.config.domain) {
      // Enable site
      await this.ssh.execOrFail(
        `ln -sf ${configPath} /etc/nginx/sites-enabled/${this.config.app.name}`
      );
    }

    // Test and reload nginx
    await this.ssh.execOrFail('nginx -t');
    await this.ssh.execOrFail('systemctl reload nginx');

    this.log('Nginx configured');
  }

  /**
   * Step 8: Obtain SSL certificate
   */
  private async obtainSsl(): Promise<void> {
    if (!this.config.domain) {
      return;
    }

    this.progress('obtain-ssl', 'Obtaining SSL certificate...');

    try {
      await this.ssh.execOrFail(
        `certbot --nginx -d ${this.config.domain.name} ` +
          `--non-interactive --agree-tos --email ${this.config.domain.email}`
      );
      this.log('SSL certificate obtained');
    } catch (error) {
      // SSL is not critical - log and continue
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(`SSL certificate failed: ${errorMessage}`);
      this.log(`SSL certificate failed (non-critical): ${errorMessage}`);
    }
  }

  /**
   * Step 9: Verify application health
   */
  private async verifyHealth(): Promise<boolean> {
    this.progress('health-check', 'Verifying application health...');

    const url = `http://127.0.0.1:${this.config.app.port}${this.config.app.healthEndpoint}`;
    const retries = this.config.options.healthCheckRetries;
    const interval = this.config.options.healthCheckInterval;

    for (let i = 0; i < retries; i++) {
      try {
        const result = await this.ssh.exec(`curl -sf "${url}"`);
        if (result.code === 0) {
          this.log('Health check passed');
          return true;
        }
      } catch {
        // Ignore errors during retry
      }

      this.log(`Health check attempt ${i + 1}/${retries} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    this.errors.push('Health check failed after all retries');
    return false;
  }

  /**
   * Step 10: Create success snapshot
   */
  private async createSuccessSnapshot(): Promise<void> {
    this.progress('create-snapshot', 'Creating deployment snapshot...');

    try {
      const snapshot = await this.apiClient.createSnapshot(
        this.serverId!,
        `deploy-${this.config.app.name}-${Date.now()}`
      );
      this.snapshotId = snapshot.id;
      this.log(`Snapshot created: ${snapshot.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(`Snapshot creation failed: ${errorMessage}`);
      this.log(`Snapshot creation failed (non-critical): ${errorMessage}`);
    }
  }

  /**
   * Rollback to a snapshot
   */
  async rollback(snapshotId: number): Promise<void> {
    if (!this.serverId) {
      throw new Error('No server ID available for rollback');
    }

    this.log(`Rolling back to snapshot ${snapshotId}...`);
    await this.apiClient.restoreSnapshot(this.serverId, snapshotId);
    this.log('Rollback initiated');

    // Wait for server to come back up
    await this.apiClient.waitForStatus(this.serverId, 'running', {
      timeout: 300000,
      onProgress: (status) => {
        this.log(`Rollback status: ${status}`);
      },
    });

    this.log('Rollback complete');
  }

  /**
   * Deploy to an existing server (skip provisioning)
   */
  async deployToExisting(serverId: number, serverIp: string, password: string): Promise<DeploymentResult> {
    this.serverId = serverId;
    this.serverIp = serverIp;
    this.serverPassword = password;

    const startTime = new Date();

    try {
      // Connect via SSH
      await this.waitForSsh();

      // Deploy application
      await this.deployApplication();

      // Configure Nginx
      await this.configureNginx();

      // Obtain SSL if domain configured
      if (this.config.domain) {
        await this.obtainSsl();
      }

      // Health check
      const healthCheckPassed = await this.verifyHealth();

      // Create snapshot
      if (this.config.options.createSnapshot && healthCheckPassed) {
        await this.createSuccessSnapshot();
      }

      this.progress('complete', 'Deployment to existing server completed');

      return {
        success: true,
        serverId,
        serverIp,
        snapshotId: this.snapshotId,
        healthCheckPassed,
        deployedAt: startTime.toISOString(),
        appUrl: this.config.domain
          ? `https://${this.config.domain.name}`
          : `http://${serverIp}`,
        errors: this.errors,
        logs: this.logs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(errorMessage);

      return {
        success: false,
        serverId,
        serverIp,
        healthCheckPassed: false,
        deployedAt: startTime.toISOString(),
        errors: this.errors,
        logs: this.logs,
      };
    } finally {
      await this.ssh.disconnect();
    }
  }

  /**
   * Get deployment logs
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Get deployment errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }
}
