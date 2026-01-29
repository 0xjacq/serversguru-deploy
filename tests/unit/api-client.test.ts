import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServersGuruClient, ServersGuruApiError } from '../../src/api/servers-guru.js';

describe('ServersGuruClient', () => {
  let client: ServersGuruClient;

  beforeEach(() => {
    client = new ServersGuruClient({
      apiKey: 'test-api-key',
      baseUrl: 'https://my.servers.guru/api',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with provided config', () => {
      expect(client).toBeInstanceOf(ServersGuruClient);
    });

    it('should use default base URL if not provided', () => {
      const clientWithDefault = new ServersGuruClient({
        apiKey: 'test-key',
        baseUrl: 'https://my.servers.guru/api',
      });
      expect(clientWithDefault).toBeInstanceOf(ServersGuruClient);
    });
  });

  describe('getBalance', () => {
    it('should return balance from API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { balance: 100.50 } }),
      });
      global.fetch = mockFetch;

      const balance = await client.getBalance();

      expect(balance).toBe(100.50);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://my.servers.guru/api/users/balance',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-API-KEY': 'test-api-key',
          }),
        })
      );
    });

    it('should throw on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Invalid API key' }),
      });

      await expect(client.getBalance()).rejects.toThrow(ServersGuruApiError);
    });
  });

  describe('getProducts', () => {
    it('should return list of products', async () => {
      const mockProducts = [
        { id: 'NL1-1', name: 'Basic', cpu: 1, ram: 1, disk: 20, price: { monthly: 5 } },
        { id: 'NL1-2', name: 'Standard', cpu: 2, ram: 2, disk: 40, price: { monthly: 10 } },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProducts }),
      });

      const products = await client.getProducts();

      expect(products).toEqual(mockProducts);
    });
  });

  describe('getImages', () => {
    it('should return list of OS images', async () => {
      const mockImages = ['ubuntu-22.04', 'ubuntu-20.04', 'debian-11'];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockImages }),
      });

      const images = await client.getImages();

      expect(images).toEqual(mockImages);
    });
  });

  describe('orderVps', () => {
    it('should order VPS and return credentials', async () => {
      const mockResponse = {
        success: true,
        data: {
          serverId: 12345,
          ipv4: '192.168.1.100',
          password: 'secretpass123',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.orderVps({
        vpsType: 'NL1-2',
        osImage: 'ubuntu-22.04',
        billingCycle: 1,
      });

      expect(result.success).toBe(true);
      expect(result.serverId).toBe(12345);
      expect(result.ipv4).toBe('192.168.1.100');
      expect(result.password).toBe('secretpass123');
    });

    it('should throw on order failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, message: 'Insufficient balance' }),
      });

      await expect(
        client.orderVps({
          vpsType: 'NL1-2',
          osImage: 'ubuntu-22.04',
          billingCycle: 1,
        })
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('getServerStatus', () => {
    it('should return server status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { status: 'running', uptime: 3600 },
          }),
      });

      const status = await client.getServerStatus(123);

      expect(status.status).toBe('running');
      expect(status.uptime).toBe(3600);
    });
  });

  describe('powerAction', () => {
    it('should send power action to server', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      global.fetch = mockFetch;

      await client.powerAction(123, 'reboot');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my.servers.guru/api/servers/123/power',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ powerType: 'reboot' }),
        })
      );
    });
  });

  describe('createSnapshot', () => {
    it('should create snapshot and return info', async () => {
      const mockSnapshot = {
        id: 456,
        name: 'my-snapshot',
        size: 10,
        createdAt: '2024-01-15T10:00:00Z',
        status: 'completed',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockSnapshot }),
      });

      const snapshot = await client.createSnapshot(123, 'my-snapshot');

      expect(snapshot.id).toBe(456);
      expect(snapshot.name).toBe('my-snapshot');
    });
  });

  describe('waitForStatus', () => {
    it('should poll until target status reached', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount >= 3 ? 'running' : 'provisioning';
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { status } }),
        });
      });

      const status = await client.waitForStatus(123, 'running', {
        timeout: 10000,
        pollInterval: 10,
      });

      expect(status.status).toBe('running');
      expect(callCount).toBe(3);
    });

    it('should throw on error status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { status: 'error' } }),
      });

      await expect(
        client.waitForStatus(123, 'running', { timeout: 1000 })
      ).rejects.toThrow('entered error state');
    });
  });
});
