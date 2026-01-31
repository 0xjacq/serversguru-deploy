import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { DeploymentConfig } from '../../src/config.js';
import { DeploymentOrchestrator } from '../../src/orchestrator.js';

// Shared mock instances that both the mock and tests can access
const mockApiClient = {
  getBalance: vi.fn(),
  orderVps: vi.fn(),
  getServerStatus: vi.fn(),
  waitForStatus: vi.fn(),
  createSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
};

const mockSsh = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  exec: vi.fn(),
  execOrFail: vi.fn(),
  uploadContent: vi.fn(),
};

// Mock dependencies using shared instances
vi.mock('../../src/api/servers-guru.js', () => {
  return {
    ServersGuruClient: class MockServersGuruClient {
      getBalance = mockApiClient.getBalance;
      orderVps = mockApiClient.orderVps;
      getServerStatus = mockApiClient.getServerStatus;
      waitForStatus = mockApiClient.waitForStatus;
      createSnapshot = mockApiClient.createSnapshot;
      restoreSnapshot = mockApiClient.restoreSnapshot;
    },
    ServersGuruApiError: class ServersGuruApiError extends Error {},
  };
});

vi.mock('../../src/ssh/provisioner.js', () => {
  return {
    SshProvisioner: class MockSshProvisioner {
      connect = mockSsh.connect;
      disconnect = mockSsh.disconnect;
      exec = mockSsh.exec;
      execOrFail = mockSsh.execOrFail;
      uploadContent = mockSsh.uploadContent;
      static waitForSsh = vi.fn().mockResolvedValue(undefined);
    },
  };
});

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

    // Setup default mock implementations
    mockApiClient.getBalance.mockResolvedValue(100);
    mockApiClient.orderVps.mockResolvedValue({
      serverId: 12345,
      ipv4: '192.168.1.100',
      password: 'test-password',
      success: true,
    });
    mockApiClient.getServerStatus.mockResolvedValue({ status: 'running' });
    mockApiClient.waitForStatus.mockResolvedValue({ status: 'running' });
    mockApiClient.createSnapshot.mockResolvedValue({
      id: 999,
      name: 'test-snapshot',
      size: 10,
      createdAt: '2024-01-01',
      status: 'active',
    });
    mockApiClient.restoreSnapshot.mockResolvedValue(undefined);

    mockSsh.connect.mockResolvedValue(undefined);
    mockSsh.disconnect.mockResolvedValue(undefined);
    mockSsh.exec.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    mockSsh.execOrFail.mockResolvedValue('success');
    mockSsh.uploadContent.mockResolvedValue(undefined);

    orchestrator = new DeploymentOrchestrator(baseConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      expect(orchestrator).toBeInstanceOf(DeploymentOrchestrator);
    });

    it('should accept config with custom timeouts', () => {
      const customConfig = {
        ...baseConfig,
        options: {
          ...baseConfig.options,
          provisioningTimeout: 900000,
          setupTimeout: 1200000,
        },
      };
      const customOrchestrator = new DeploymentOrchestrator(customConfig);
      expect(customOrchestrator).toBeInstanceOf(DeploymentOrchestrator);
    });

    it('should accept minimal required config', () => {
      const minimalConfig: DeploymentConfig = {
        serversGuru: baseConfig.serversGuru,
        vps: baseConfig.vps,
        ssh: baseConfig.ssh,
        app: baseConfig.app,
        options: baseConfig.options,
      };
      const minimalOrchestrator = new DeploymentOrchestrator(minimalConfig);
      expect(minimalOrchestrator).toBeInstanceOf(DeploymentOrchestrator);
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

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await domainOrchestrator.deploy();

      expect(result.success).toBe(true);
      expect(result.appUrl).toBe('https://test.example.com');
    });

    it('should continue even if SSL certificate fails', async () => {
      const domainOrchestrator = new DeploymentOrchestrator(configWithDomain);

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

      await orchestrator.rollback(999);

      expect(mockApiClient.restoreSnapshot).toHaveBeenCalledWith(12345, 999);
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
        },
      };

      const timeoutOrchestrator = new DeploymentOrchestrator(configTimeout);

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

      mockSsh.exec.mockResolvedValue({ stdout: 'OK', stderr: '', code: 0 });
      mockSsh.execOrFail.mockResolvedValue('success');

      const result = await authOrchestrator.deploy();

      expect(result.success).toBe(true);
      expect(mockSsh.execOrFail).toHaveBeenCalledWith(expect.stringContaining('docker login'));
    });
  });
});
