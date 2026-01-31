/**
 * Integration tests for API client with mock server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { ServersGuruClient } from '../../src/api/servers-guru.js';
import { DeploymentError } from '../../src/errors.js';

import { MockServersGuruApi } from './mock-api-server.js';

describe('ServersGuruClient Integration', () => {
  let mockApi: MockServersGuruApi;
  let client: ServersGuruClient;

  beforeAll(async () => {
    mockApi = new MockServersGuruApi({
      port: 9876,
      balance: 100,
      latency: 10, // Small latency for realism
    });
    await mockApi.start();
  });

  afterAll(async () => {
    await mockApi.stop();
  });

  beforeEach(() => {
    client = new ServersGuruClient({
      apiKey: 'test-api-key',
      baseUrl: mockApi.getBaseUrl(),
    });
    mockApi.clearRequestLog();
    mockApi.setBalance(100);
  });

  describe('getBalance', () => {
    it('should retrieve account balance', async () => {
      const balance = await client.getBalance();

      expect(balance).toBe(100);

      const logs = mockApi.getRequestLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].method).toBe('GET');
      expect(logs[0].path).toBe('/users/balance');
    });

    it('should throw on invalid API key', async () => {
      const invalidClient = new ServersGuruClient({
        apiKey: '',
        baseUrl: mockApi.getBaseUrl(),
      });

      await expect(invalidClient.getBalance()).rejects.toThrow();
    });
  });

  describe('getProducts', () => {
    it('should retrieve available products', async () => {
      const products = await client.getProducts();

      expect(products).toBeInstanceOf(Array);
      expect(products.length).toBeGreaterThan(0);
      expect(products[0]).toHaveProperty('id');
      expect(products[0]).toHaveProperty('name');
      expect(products[0]).toHaveProperty('price');
    });

    it('should return products with correct structure', async () => {
      const products = await client.getProducts();

      const product = products[0];
      expect(product).toHaveProperty('cpu');
      expect(product).toHaveProperty('ram');
      expect(product).toHaveProperty('disk');
      expect(product).toHaveProperty('bandwidth');
      expect(product).toHaveProperty('locations');
      expect(product).toHaveProperty('available');
      expect(product.price).toHaveProperty('monthly');
      expect(product.price).toHaveProperty('yearly');
    });
  });

  describe('getImages', () => {
    it('should retrieve available OS images', async () => {
      const images = await client.getImages();

      expect(images).toBeInstanceOf(Array);
      expect(images.length).toBeGreaterThan(0);
      expect(images).toContain('ubuntu-22.04');
    });
  });

  describe('orderVps', () => {
    it('should order a VPS successfully', async () => {
      const result = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
        hostname: 'test-server',
      });

      expect(result.success).toBe(true);
      expect(result.serverId).toBeDefined();
      expect(result.ipv4).toBeDefined();
      expect(result.password).toBeDefined();
    });

    it('should deduct balance when ordering', async () => {
      const initialBalance = await client.getBalance();

      await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const newBalance = await client.getBalance();
      expect(newBalance).toBeLessThan(initialBalance);
    });

    it('should throw on insufficient balance', async () => {
      mockApi.setBalance(0);

      await expect(
        client.orderVps({
          vpsType: 'NL1-2',
          osImage: 'ubuntu-22.04',
          billingCycle: 1,
        })
      ).rejects.toThrow();
    });

    it('should throw on unavailable product', async () => {
      await expect(
        client.orderVps({
          vpsType: 'NONEXISTENT',
          osImage: 'ubuntu-22.04',
          billingCycle: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe('listServers', () => {
    it('should list all servers', async () => {
      // First create a server
      await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const servers = await client.listServers();

      expect(servers).toBeInstanceOf(Array);
      expect(servers.length).toBeGreaterThan(0);
    });

    it('should filter servers by search term', async () => {
      // Create servers with different names
      await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
        hostname: 'production-server',
      });

      await client.orderVps({
        vpsType: 'NL1-1',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
        hostname: 'staging-server',
      });

      const servers = await client.listServers({ search: 'production' });

      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0].name).toContain('production');
    });
  });

  describe('getServer', () => {
    it('should retrieve server by ID', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const server = await client.getServer(orderResult.serverId);

      expect(server.id).toBe(orderResult.serverId);
      expect(server.ipv4).toBe(orderResult.ipv4);
    });

    it('should throw on non-existent server', async () => {
      await expect(client.getServer(99999)).rejects.toThrow();
    });
  });

  describe('getServerStatus', () => {
    it('should retrieve server status', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const status = await client.getServerStatus(orderResult.serverId);

      expect(status).toHaveProperty('status');
      expect(['running', 'stopped', 'provisioning', 'error']).toContain(status.status);
    });
  });

  describe('powerAction', () => {
    it('should start a stopped server', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      await client.stopServer(orderResult.serverId);

      let status = await client.getServerStatus(orderResult.serverId);
      expect(status.status).toBe('stopped');

      await client.startServer(orderResult.serverId);

      status = await client.getServerStatus(orderResult.serverId);
      expect(status.status).toBe('running');
    });

    it('should reboot a running server', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      // Wait for server to be running
      await new Promise((resolve) => setTimeout(resolve, 100));

      await client.rebootServer(orderResult.serverId);

      // After reboot, server should eventually be running
      const status = await client.getServerStatus(orderResult.serverId);
      expect(['provisioning', 'running']).toContain(status.status);
    });
  });

  describe('waitForStatus', () => {
    it('should wait for server to reach target status', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const status = await client.waitForStatus(orderResult.serverId, 'running', {
        timeout: 5000,
        pollInterval: 100,
      });

      expect(status.status).toBe('running');
    });

    it('should timeout if status not reached', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      // Immediately stop the server
      await client.stopServer(orderResult.serverId);

      await expect(
        client.waitForStatus(orderResult.serverId, 'running', {
          timeout: 500,
          pollInterval: 100,
        })
      ).rejects.toThrow('Timeout');
    });

    it('should call onProgress callback', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const progressCallback = vi.fn();

      await client.waitForStatus(orderResult.serverId, 'running', {
        timeout: 5000,
        pollInterval: 100,
        onProgress: progressCallback,
      });

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('snapshots', () => {
    it('should create a snapshot', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const snapshot = await client.createSnapshot(orderResult.serverId, 'test-snapshot');

      expect(snapshot).toHaveProperty('id');
      expect(snapshot).toHaveProperty('name', 'test-snapshot');
      expect(snapshot).toHaveProperty('createdAt');
    });

    it('should list snapshots', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      await client.createSnapshot(orderResult.serverId, 'snapshot-1');
      await client.createSnapshot(orderResult.serverId, 'snapshot-2');

      const snapshots = await client.listSnapshots(orderResult.serverId);

      expect(snapshots).toHaveLength(2);
    });

    it('should return empty array for server with no snapshots', async () => {
      const orderResult = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      const snapshots = await client.listSnapshots(orderResult.serverId);

      expect(snapshots).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const badClient = new ServersGuruClient({
        apiKey: 'test',
        baseUrl: 'http://localhost:1', // Invalid port
      });

      await expect(badClient.getBalance()).rejects.toThrow();
    });

    it('should include status code in API errors', async () => {
      try {
        await client.getServer(99999);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        // The error should contain useful information
        expect((error as Error).message).toContain('404');
      }
    });
  });
});
