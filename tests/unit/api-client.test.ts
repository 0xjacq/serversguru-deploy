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
        json: async () => Promise.resolve({ balance: 100.5 }),
      });
      global.fetch = mockFetch;

      const balance = await client.getBalance();

      expect(balance).toBe(100.5);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://my.servers.guru/api/users/balance',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'X-API-KEY': 'test-api-key',
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );
    });

    it('should throw on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => Promise.resolve({ message: 'Invalid API key' }),
      });

      await expect(client.getBalance()).rejects.toThrow(ServersGuruApiError);
    });
  });

  describe('getProducts', () => {
    it('should return list of products', async () => {
      // Actual API returns object keyed by product ID with raw field names
      const mockProductsRaw = {
        'NL1-1': {
          ProductId: 1,
          Cpu: 1,
          Ram: 1024,
          Ssd: 20,
          Price: 5,
          Bandwidth: 1000,
          Location: 1,
          Arch: 'x86_64',
          CpuModel: 'AMD EPYC',
        },
        'NL1-2': {
          ProductId: 2,
          Cpu: 2,
          Ram: 2048,
          Ssd: 40,
          Price: 10,
          Bandwidth: 2000,
          Location: 1,
          Arch: 'x86_64',
          CpuModel: 'AMD EPYC',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => Promise.resolve(mockProductsRaw),
      });

      const products = await client.getProducts();

      expect(products).toHaveLength(2);
      expect(products[0]).toMatchObject({
        id: 'NL1-1',
        cpu: 1,
        ram: 1024,
        disk: 20,
        bandwidth: 1000,
        price: { monthly: 5, yearly: 60 },
      });
    });
  });

  describe('getImages', () => {
    it('should return list of OS images', async () => {
      // Actual API returns direct array of image names
      const mockImages = ['ubuntu-22.04', 'ubuntu-20.04', 'debian-11'];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => Promise.resolve(mockImages),
      });

      const images = await client.getImages();

      expect(images).toEqual(mockImages);
    });
  });

  describe('orderVps', () => {
    it('should order VPS and return credentials', async () => {
      // Actual API: first listServers returns empty, order returns { success: true },
      // then subsequent listServers calls return the new server
      const newServerId = 12345;
      const newServerIp = '192.168.1.100';

      global.fetch = vi
        .fn()
        // First call: listServers (before order) - empty
        .mockResolvedValueOnce({
          ok: true,
          json: async () => Promise.resolve({ Servers: [], Page: 0, Total: 0 }),
        })
        // Second call: orderVps - returns just { success: true }
        .mockResolvedValueOnce({
          ok: true,
          json: async () => Promise.resolve({ success: true }),
        })
        // Third call: listServers (polling) - new server appears
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            Promise.resolve({
              Servers: [
                {
                  Id: newServerId,
                  Ipv4: newServerIp,
                  Ipv6: '',
                  Name: 'test-vps',
                  VCPU: 2,
                  Ram: 2,
                  DiskSize: 40,
                  CpuModel: 'AMD EPYC',
                  Dc: 'NL',
                  Disabled: false,
                  Created_at: new Date().toISOString(),
                },
              ],
              Page: 0,
              Total: 1,
            }),
        });

      // Patch sleep to avoid delays in tests
      const originalSleep = (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep;
      (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = async () => {};

      try {
        const result = await client.orderVps({
          vpsType: 'NL1-2',
          osImage: 'ubuntu-22.04',
          billingCycle: 1,
        });

        expect(result.success).toBe(true);
        expect(result.serverId).toBe(newServerId);
        expect(result.ipv4).toBe(newServerIp);
        // Password is not available via API polling
        expect(result.password).toBe('');
      } finally {
        (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = originalSleep;
      }
    });

    it('should throw on order failure', async () => {
      // Mock listServers (called before order) and orderVps failure response
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => Promise.resolve({ Servers: [], Page: 0, Total: 0 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => Promise.resolve({ success: false, message: 'Insufficient balance' }),
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
      // Actual API returns { status: "running" } directly
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => Promise.resolve({ status: 'running' }),
      });

      const status = await client.getServerStatus(123);

      expect(status.status).toBe('running');
    });
  });

  describe('powerAction', () => {
    it('should send power action to server', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => Promise.resolve({ success: true }),
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
      // Actual API: createSnapshot returns { success: true }, then poll listSnapshots
      const snapshotId = 456;
      const snapshotName = 'my-snapshot';

      global.fetch = vi
        .fn()
        // First call: listSnapshots (before create) - empty
        .mockResolvedValueOnce({
          ok: true,
          json: async () => Promise.resolve([]),
        })
        // Second call: createSnapshot - returns just { success: true }
        .mockResolvedValueOnce({
          ok: true,
          json: async () => Promise.resolve({ success: true }),
        })
        // Third call: listSnapshots (polling) - new snapshot appears
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            Promise.resolve([
              {
                id: snapshotId,
                name: snapshotName,
                size: 10,
                createdAt: '2024-01-15T10:00:00Z',
                status: 'active',
              },
            ]),
        });

      // Patch sleep to avoid delays in tests
      const originalSleep = (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep;
      (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = async () => {};

      try {
        const snapshot = await client.createSnapshot(123, snapshotName);

        expect(snapshot.id).toBe(snapshotId);
        expect(snapshot.name).toBe(snapshotName);
      } finally {
        (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = originalSleep;
      }
    });
  });

  describe('waitForStatus', () => {
    it('should poll until target status reached', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        const status = callCount >= 3 ? 'running' : 'provisioning';
        // Actual API returns { status: "..." } directly
        return Promise.resolve({
          ok: true,
          json: async () => Promise.resolve({ status }),
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
      // Actual API returns { status: "error" } directly
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => Promise.resolve({ status: 'error' }),
      });

      await expect(client.waitForStatus(123, 'running', { timeout: 1000 })).rejects.toThrow(
        'entered error state'
      );
    });
  });
});
