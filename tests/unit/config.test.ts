import { describe, it, expect } from 'vitest';

import {
  DeploymentConfigSchema,
  VpsConfigSchema,
  AppConfigSchema,
  SshConfigSchema,
} from '../../src/config.js';

describe('Configuration Schemas', () => {
  describe('VpsConfigSchema', () => {
    it('should validate valid VPS config', () => {
      const config = {
        type: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      };

      const result = VpsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject missing type', () => {
      const config = {
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      };

      const result = VpsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should apply default billingCycle', () => {
      const config = {
        type: 'NL1-2',
        osImage: 'ubuntu-22.04',
      };

      const result = VpsConfigSchema.parse(config);
      expect(result.billingCycle).toBe(1);
    });

    it('should reject invalid billingCycle', () => {
      const config = {
        type: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 24,
      };

      const result = VpsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('AppConfigSchema', () => {
    it('should validate valid app config', () => {
      const config = {
        name: 'my-app',
        dockerImage: 'ghcr.io/user/app:latest',
        port: 3000,
      };

      const result = AppConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const config = {
        name: 'my-app',
        dockerImage: 'ghcr.io/user/app:latest',
      };

      const result = AppConfigSchema.parse(config);
      expect(result.port).toBe(3000);
      expect(result.healthEndpoint).toBe('/api/status');
      expect(result.envVars).toEqual({});
      expect(result.volumes).toEqual([]);
    });

    it('should validate registry auth', () => {
      const config = {
        name: 'my-app',
        dockerImage: 'ghcr.io/user/app:latest',
        registryAuth: {
          username: 'user',
          password: 'pass',
          registry: 'ghcr.io',
        },
      };

      const result = AppConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid port', () => {
      const config = {
        name: 'my-app',
        dockerImage: 'ghcr.io/user/app:latest',
        port: 70000,
      };

      const result = AppConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('SshConfigSchema', () => {
    it('should apply all defaults', () => {
      const result = SshConfigSchema.parse({});

      expect(result.port).toBe(22);
      expect(result.username).toBe('root');
      expect(result.connectionTimeout).toBe(30000);
      expect(result.commandTimeout).toBe(300000);
    });

    it('should allow custom values', () => {
      const config = {
        port: 2222,
        username: 'deploy',
        connectionTimeout: 60000,
      };

      const result = SshConfigSchema.parse(config);
      expect(result.port).toBe(2222);
      expect(result.username).toBe('deploy');
      expect(result.connectionTimeout).toBe(60000);
    });
  });

  describe('DeploymentConfigSchema', () => {
    it('should validate complete deployment config', () => {
      const config = {
        serversGuru: {
          apiKey: 'test-key',
        },
        vps: {
          type: 'NL1-2',
          osImage: 'ubuntu-22.04',
        },
        app: {
          name: 'my-app',
          dockerImage: 'ghcr.io/user/app:latest',
        },
      };

      const result = DeploymentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate config with domain', () => {
      const config = {
        serversGuru: {
          apiKey: 'test-key',
        },
        vps: {
          type: 'NL1-2',
          osImage: 'ubuntu-22.04',
        },
        app: {
          name: 'my-app',
          dockerImage: 'ghcr.io/user/app:latest',
        },
        domain: {
          name: 'app.example.com',
          email: 'admin@example.com',
        },
      };

      const result = DeploymentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email in domain', () => {
      const config = {
        serversGuru: {
          apiKey: 'test-key',
        },
        vps: {
          type: 'NL1-2',
          osImage: 'ubuntu-22.04',
        },
        app: {
          name: 'my-app',
          dockerImage: 'ghcr.io/user/app:latest',
        },
        domain: {
          name: 'app.example.com',
          email: 'not-an-email',
        },
      };

      const result = DeploymentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should apply default options', () => {
      const config = {
        serversGuru: {
          apiKey: 'test-key',
        },
        vps: {
          type: 'NL1-2',
          osImage: 'ubuntu-22.04',
        },
        app: {
          name: 'my-app',
          dockerImage: 'ghcr.io/user/app:latest',
        },
      };

      const result = DeploymentConfigSchema.parse(config);
      expect(result.options.createSnapshot).toBe(true);
      expect(result.options.healthCheckRetries).toBe(10);
      expect(result.options.provisioningTimeout).toBe(600000);
    });
  });
});
