import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ServersGuruClient } from '../../src/api/servers-guru.js';
import type { DeploymentConfig } from '../../src/config.js';
import { DeploymentError } from '../../src/errors.js';
import { DeploymentOrchestrator } from '../../src/orchestrator.js';
import { SshProvisioner } from '../../src/ssh/provisioner.js';

// Mock dependencies
vi.mock('../../src/api/servers-guru.js', () => ({
  ServersGuruClient: vi.fn(() => ({
    getBalance: vi.fn(),
    orderVps: vi.fn(),
    getServerStatus: vi.fn(),
    waitForStatus: vi.fn(),
    createSnapshot: vi.fn(),
  })),
  ServersGuruApiError: class ServersGuruApiError extends Error { },
}));

vi.mock('../../src/ssh/provisioner.js', () => ({
  SshProvisioner: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    exec: vi.fn(),
    execOrFail: vi.fn(),
    uploadContent: vi.fn(),
    waitForSsh: vi.fn(),
  })),
}));

// Attach static methods to the mock
(SshProvisioner as any).waitForSsh = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/templates/index.js', () => ({
  SETUP_SCRIPT: '#!/bin/bash\necho "setup"',
  DOCKER_COMPOSE_TEMPLATE: 'version: "3.8"',
  NGINX_CONFIG_TEMPLATE: 'server {}',
  NGINX_IP_CONFIG_TEMPLATE: 'server { listen 80; }',
  generateEnvFile: vi.fn(() => 'KEY=value'),
  generateEnvSection: vi.fn(() => '      - KEY=value'),
  generateVolumesSection: vi.fn(() => ''),
  renderTemplate: vi.fn((template: string, vars: Record<string, string>) => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }
    return result;
  }),
}));

describe('DeploymentOrchestrator', () => {
  let orchestrator: DeploymentOrchestrator;
  let mockApiClient: ReturnType<typeof vi.mocked<typeof ServersGuruClient>>;
  let mockSsh: ReturnType<typeof vi.mocked<typeof SshProvisioner>>;

  const baseConfig: DeploymentConfig = {
    serversGuru: {
      apiKey: 'test-api-key',
      baseUrl: 'https://my.servers.guru/api',
    },
    vps: {
      type: 'NL1-2',
      osImage: 'ubuntu-22.04',
      billingCycle: 1,
    },
    ssh: {
      port: 22,
      username: 'root',
      connectionTimeout: 30000,
      commandTimeout: 300000,
    },
    app: {
      name: 'test-app',
      dockerImage: 'nginx:latest',
      port: 3000,
      healthEndpoint: '/health',
      envVars: {},
      volumes: [],
    },
    options: {
      createSnapshot: true,
      healthCheckRetries: 3,
      healthCheckInterval: 10,
      provisioningTimeout: 600000,
      setupTimeout: 900000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock implementations
    mockApiClient = {
      getBalance: vi.fn().mockResolvedValue(100),
      orderVps: vi.fn().mockResolvedValue({
        serverId: 12345,
        ipv4: '192.168.1.100',
        password: 'test-password',
        success: true,
      }),
      getServerStatus: vi.fn().mockResolvedValue({ status: 'running' }),
      waitForStatus: vi.fn().mockResolvedValue({ status: 'running' }),
      createSnapshot: vi.fn().mockResolvedValue({ id: 999, name: 'test-snapshot', size: 10, createdAt: '2024-01-01', status: 'active' }),
    } as unknown as ReturnType<typeof vi.mocked<typeof ServersGuruClient>>;

    mockSsh = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      execOrFail: vi.fn().mockResolvedValue('success'),
      uploadContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof vi.mocked<typeof SshProvisioner>>;

    (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
    (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

    orchestrator = new DeploymentOrchestrator(baseConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      expect(orchestrator).toBeInstanceOf(DeploymentOrchestrator);
    });

    it('should create API client with config', () => {
      expect(ServersGuruClient).toHaveBeenCalledWith(baseConfig.serversGuru);
    });

    it('should create SSH provisioner with config', () => {
      expect(SshProvisioner).toHaveBeenCalledWith(baseConfig.ssh);
    });
  });

  describe('setProgressCallback', () => {
    it('should set progress callback', () => {
      const callback = vi.fn();
      orchestrator.setProgressCallback(callback);
      // Callback is private, but we can verify it doesn't throw
    });
  });

  describe('deploy', () => {
    it('should complete full deployment successfully', async () => {
      // Setup SSH mocks for deployment steps
      mockSsh.execOrFail.mockResolvedValue('success');
      mockSsh.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }) // Setup script
        .mockResolvedValueOnce({ stdout: 'healthy', stderr: '', code: 0 }) // Container health
        .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }); // App health check

      const result = await orchestrator.deploy();

      expect(result.success).toBe(true);
      expect(result.serverId).toBe(12345);
      expect(result.serverIp).toBe('192.168.1.100');
      expect(result.healthCheckPassed).toBe(true);
    });

    it('should fail if balance is insufficient', async () => {
      mockApiClient.getBalance.mockResolvedValue(0);

      const result = await orchestrator.deploy();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Insufficient account balance');
    });

    it('should fail if VPS order fails', async () => {
      mockApiClient.orderVps.mockRejectedValue(new Error('Product not available'));

      const result = await orchestrator.deploy();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Product not available'))).toBe(true);
    });

    it('should fail if provisioning times out', async () => {
      mockApiClient.waitForStatus.mockRejectedValue(new Error('Timeout'));

      const result = await orchestrator.deploy();

      expect(result.success).toBe(false);
    });

    it('should handle SSH connection failure', async () => {
      mockSsh.connect.mockRejectedValue(new Error('Connection refused'));

      const result = await orchestrator.deploy();

      expect(result.success).toBe(false);
    });

    it('should handle setup script failure', async () => {
      mockSsh.execOrFail.mockRejectedValue(new Error('Setup failed'));

      const result = await orchestrator.deploy();

      expect(result.success).toBe(false);
    });

    it('should continue even if health check fails', async () => {
      mockSsh.exec
        .mockResolvedValueOnce({ stdout: 'OK', stderr: '', code: 0 }) // setup script
        .mockResolvedValue({ stdout: '', stderr: '', code: 1 }); // health checks fail

      const result = await orchestrator.deploy();

      expect(result.success).toBe(true); // Deployment succeeded
      expect(result.healthCheckPassed).toBe(false); // But health check failed
    });

    it('should not create snapshot if health check fails', async () => {
      mockSsh.exec.mockResolvedValue({ stdout: '', stderr: '', code: 1 });

      await orchestrator.deploy();

      expect(mockApiClient.createSnapshot).not.toHaveBeenCalled();
    });

    it('should handle snapshot creation failure gracefully', async () => {
      mockApiClient.createSnapshot.mockRejectedValue(new Error('Snapshot failed'));
      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });

      const result = await orchestrator.deploy();

      expect(result.success).toBe(true);
      expect(result.errors.some((e) => e.includes('Snapshot'))).toBe(true);
    });

    it('should call progress callback for each step', async () => {
      const progressCallback = vi.fn();
      orchestrator.setProgressCallback(progressCallback);

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });

      await orchestrator.deploy();

      expect(progressCallback).toHaveBeenCalled();
    });

    it('should disconnect SSH even on failure', async () => {
      mockApiClient.getBalance.mockRejectedValue(new Error('API Error'));

      await orchestrator.deploy();

      expect(mockSsh.disconnect).toHaveBeenCalled();
    });
  });

  describe('deploy with domain', () => {
    const configWithDomain: DeploymentConfig = {
      ...baseConfig,
      domain: {
        name: 'test.example.com',
        email: 'admin@example.com',
      },
    };

    it('should configure SSL when domain is provided', async () => {
      const domainOrchestrator = new DeploymentOrchestrator(configWithDomain);
      (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
      (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await domainOrchestrator.deploy();

      expect(result.success).toBe(true);
      expect(result.appUrl).toBe('https://test.example.com');
    });

    it('should continue even if SSL certificate fails', async () => {
      const domainOrchestrator = new DeploymentOrchestrator(configWithDomain);
      (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
      (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

      mockSsh.execOrFail
        .mockResolvedValueOnce('success') // setup
        .mockResolvedValueOnce('success') // docker login
        .mockResolvedValueOnce('success') // docker pull
        .mockResolvedValueOnce('success') // docker compose up
        .mockResolvedValueOnce('success') // nginx config
        .mockResolvedValueOnce('success') // nginx enable
        .mockResolvedValueOnce('success') // nginx test

        .mockRejectedValueOnce(new Error('Certbot failed')); // SSL fails

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });

      const result = await domainOrchestrator.deploy();

      expect(result.success).toBe(true);
      expect(result.errors.some((e) => e.includes('SSL'))).toBe(true);
    });
  });

  describe('deployToExisting', () => {
    it('should deploy to existing server', async () => {
      mockSsh.exec.mockResolvedValue({ stdout: 'healthy', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await orchestrator.deployToExisting(12345, '192.168.1.100', 'password');

      expect(result.success).toBe(true);
      expect(result.serverId).toBe(12345);
      expect(result.serverIp).toBe('192.168.1.100');
    });

    it('should skip VPS ordering for existing server', async () => {
      mockSsh.exec.mockResolvedValue({ stdout: 'healthy', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      await orchestrator.deployToExisting(12345, '192.168.1.100', 'password');

      expect(mockApiClient.orderVps).not.toHaveBeenCalled();
      expect(mockApiClient.waitForStatus).not.toHaveBeenCalled();
    });

    it('should handle deployment failure to existing server', async () => {
      mockSsh.connect.mockRejectedValue(new Error('Connection failed'));

      const result = await orchestrator.deployToExisting(12345, '192.168.1.100', 'password');

      expect(result.success).toBe(false);
    });
  });

  describe('rollback', () => {
    it('should rollback to snapshot', async () => {
      // First deploy to set serverId
      mockSsh.exec.mockResolvedValue({ stdout: 'healthy', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      await orchestrator.deploy();

      mockApiClient.waitForStatus.mockClear();
      mockApiClient.waitForStatus.mockResolvedValue({ status: 'running' });

      // Add restoreSnapshot mock
      (mockApiClient as unknown as { restoreSnapshot: ReturnType<typeof vi.fn> }).restoreSnapshot = vi.fn().mockResolvedValue(undefined);

      await orchestrator.rollback(999);

      expect((mockApiClient as unknown as { restoreSnapshot: ReturnType<typeof vi.fn> }).restoreSnapshot).toHaveBeenCalledWith(12345, 999);
    });

    it('should throw error if no server ID for rollback', async () => {
      await expect(orchestrator.rollback(999)).rejects.toThrow('No server ID available');
    });
  });

  describe('getLogs and getErrors', () => {
    it('should return deployment logs', async () => {
      mockApiClient.getBalance.mockRejectedValue(new Error('Test error'));

      await orchestrator.deploy();

      const logs = orchestrator.getLogs();
      const errors = orchestrator.getErrors();

      expect(logs.length).toBeGreaterThan(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return copies of logs/errors', async () => {
      await orchestrator.deploy();

      const logs1 = orchestrator.getLogs();
      const logs2 = orchestrator.getLogs();

      expect(logs1).not.toBe(logs2); // Different array instances
    });
  });

  describe('container health check', () => {
    it('should wait for container to be healthy', async () => {
      mockSsh.exec
        .mockResolvedValueOnce({ stdout: 'starting', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'starting', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'healthy', stderr: '', code: 0 });

      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await orchestrator.deploy();

      expect(result.success).toBe(true);
    });

    it('should fail if container becomes unhealthy', async () => {
      mockSsh.exec.mockResolvedValue({ stdout: 'unhealthy', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await orchestrator.deploy();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('unhealthy'))).toBe(true);
    });

    it('should continue after health check timeout', async () => {
      const configTimeout = {
        ...baseConfig,
        options: {
          ...baseConfig.options,
          healthCheckRetries: 1,
          healthCheckInterval: 10, // 10ms
        }
      };

      const timeoutOrchestrator = new DeploymentOrchestrator(configTimeout);
      (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
      (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

      mockSsh.exec.mockResolvedValue({ stdout: 'starting', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await timeoutOrchestrator.deploy();

      expect(result.success).toBe(true);
    });
  });

  describe('configuration variations', () => {
    it('should handle config without snapshot creation', async () => {
      const configNoSnapshot = {
        ...baseConfig,
        options: { ...baseConfig.options, createSnapshot: false },
      };

      const noSnapshotOrchestrator = new DeploymentOrchestrator(configNoSnapshot);
      (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
      (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await noSnapshotOrchestrator.deploy();

      expect(result.success).toBe(true);
      expect(mockApiClient.createSnapshot).not.toHaveBeenCalled();
    });

    it('should handle config with volumes', async () => {
      const configWithVolumes = {
        ...baseConfig,
        app: { ...baseConfig.app, volumes: ['./data:/app/data'] },
      };

      const volumeOrchestrator = new DeploymentOrchestrator(configWithVolumes);
      (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
      (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await volumeOrchestrator.deploy();

      expect(result.success).toBe(true);
    });

    it('should handle config with registry auth', async () => {
      const configWithAuth = {
        ...baseConfig,
        app: {
          ...baseConfig.app,
          registryAuth: {
            username: 'user',
            password: 'pass',
            registry: 'ghcr.io',
          },
        },
      };

      const authOrchestrator = new DeploymentOrchestrator(configWithAuth);
      (ServersGuruClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockApiClient);
      (SshProvisioner as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSsh);

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await authOrchestrator.deploy();

      expect(result.success).toBe(true);
      expect(mockSsh.execOrFail).toHaveBeenCalledWith(
        expect.stringContaining('docker login')
      );
    });
  });
});
