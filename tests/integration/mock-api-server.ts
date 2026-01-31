/**
 * Mock Servers.guru API Server for integration tests
 *
 * Provides a simulated API environment for testing without
 * making real API calls.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

import type { VpsProduct, ServerInfo, ServerStatus, Snapshot } from '../../src/config.js';

/**
 * Mock API response
 */
interface MockResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Mock API Server configuration
 */
interface MockApiServerConfig {
  /** Port to listen on */
  port: number;
  /** Initial account balance */
  balance: number;
  /** Available products */
  products: VpsProduct[];
  /** Available OS images */
  images: string[];
  /** Simulate latency in ms */
  latency?: number;
  /** Error injection rate (0-1) */
  errorRate?: number;
}

/**
 * Mock API Server for testing
 */
export class MockServersGuruApi {
  private server: Server | null = null;
  private readonly config: MockApiServerConfig;
  private readonly servers: Map<number, ServerInfo> = new Map();
  private readonly snapshots: Map<number, Snapshot[]> = new Map();
  private nextServerId = 1000;
  private requestLog: Array<{ method: string; path: string; body?: unknown }> = [];

  constructor(config: Partial<MockApiServerConfig> = {}) {
    this.config = {
      port: config.port ?? 8765,
      balance: config.balance ?? 100,
      products: config.products ?? this.getDefaultProducts(),
      images: config.images ?? ['ubuntu-22.04', 'ubuntu-20.04', 'debian-11', 'debian-12'],
      latency: config.latency ?? 0,
      errorRate: config.errorRate ?? 0,
    };
  }

  /**
   * Get default mock products
   */
  private getDefaultProducts(): VpsProduct[] {
    return [
      {
        id: 'NL1-1',
        name: 'Basic',
        cpu: 1,
        ram: 1,
        disk: 20,
        bandwidth: 1000,
        price: { monthly: 5, yearly: 50 },
        locations: ['NL'],
        available: true,
      },
      {
        id: 'NL1-2',
        name: 'Standard',
        cpu: 2,
        ram: 2,
        disk: 40,
        bandwidth: 2000,
        price: { monthly: 10, yearly: 100 },
        locations: ['NL'],
        available: true,
      },
      {
        id: 'NL1-4',
        name: 'Pro',
        cpu: 4,
        ram: 4,
        disk: 80,
        bandwidth: 4000,
        price: { monthly: 20, yearly: 200 },
        locations: ['NL'],
        available: true,
      },
    ];
  }

  /**
   * Start the mock server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.on('error', reject);

      this.server.listen(this.config.port, () => {
        console.log(`Mock API server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the base URL for the mock server
   */
  getBaseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }

  /**
   * Get request log
   */
  getRequestLog(): Array<{ method: string; path: string; body?: unknown }> {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  /**
   * Add a mock server
   */
  addServer(serverInfo: Partial<ServerInfo>): ServerInfo {
    const id = this.nextServerId++;
    const server: ServerInfo = {
      id,
      name: serverInfo.name ?? `server-${id}`,
      status: serverInfo.status ?? 'running',
      ipv4:
        serverInfo.ipv4 ??
        `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      osImage: serverInfo.osImage ?? 'ubuntu-22.04',
      vpsType: serverInfo.vpsType ?? 'NL1-2',
      datacenter: serverInfo.datacenter ?? 'NL',
      createdAt: serverInfo.createdAt ?? new Date().toISOString(),
      ...serverInfo,
    };

    this.servers.set(id, server);
    this.snapshots.set(id, []);
    return server;
  }

  /**
   * Get all mock servers
   */
  getServers(): ServerInfo[] {
    return Array.from(this.servers.values());
  }

  /**
   * Set account balance
   */
  setBalance(balance: number): void {
    this.config.balance = balance;
  }

  /**
   * Inject an error for the next request
   */
  injectError(_error: Error): void {
    this.config.errorRate = 1;
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${this.config.port}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // Simulate latency
    if (this.config.latency && this.config.latency > 0) {
      await this.sleep(this.config.latency);
    }

    // Simulate random errors
    if (
      this.config.errorRate !== undefined &&
      this.config.errorRate > 0 &&
      Math.random() < this.config.errorRate
    ) {
      this.sendError(res, 500, 'Internal server error');
      return;
    }

    // Parse body for POST/PUT requests
    let body: unknown = undefined;
    if (method === 'POST' || method === 'PUT') {
      body = await this.parseBody(req);
    }

    // Log request
    this.requestLog.push({ method, path, body });

    // Verify API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey && path !== '/health') {
      this.sendError(res, 401, 'Unauthorized');
      return;
    }

    // Route request
    try {
      switch (path) {
        case '/users/balance':
          await this.handleGetBalance(res);
          break;
        case '/servers/vps/products':
          await this.handleGetProducts(res);
          break;
        case '/servers/vps/images':
          await this.handleGetImages(res);
          break;
        case '/servers':
          await this.handleListServers(res, url.searchParams);
          break;
        case '/servers/vps/order':
          await this.handleOrderVps(res, body);
          break;
        default:
          if (path.startsWith('/servers/')) {
            await this.handleServerRequest(method, path, res, body);
          } else {
            this.sendError(res, 404, 'Not found');
          }
      }
    } catch (error) {
      console.error('Mock API error:', error);
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * Handle GET /users/balance
   */
  private async handleGetBalance(res: ServerResponse): Promise<void> {
    await this.sleep(0);
    this.sendJson(res, 200, { success: true, data: { balance: this.config.balance } });
  }

  /**
   * Handle GET /servers/vps/products
   */
  private async handleGetProducts(res: ServerResponse): Promise<void> {
    await this.sleep(0);
    this.sendJson(res, 200, { success: true, data: this.config.products });
  }

  /**
   * Handle GET /servers/vps/images
   */
  private async handleGetImages(res: ServerResponse): Promise<void> {
    await this.sleep(0);
    this.sendJson(res, 200, { success: true, data: this.config.images });
  }

  /**
   * Handle GET /servers
   */
  private async handleListServers(res: ServerResponse, params: URLSearchParams): Promise<void> {
    await this.sleep(0);
    let servers = Array.from(this.servers.values());

    const search = params.get('search');
    if (search) {
      servers = servers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    }

    this.sendJson(res, 200, { success: true, data: servers });
  }

  /**
   * Handle POST /servers/vps/order
   */
  private async handleOrderVps(res: ServerResponse, body: unknown): Promise<void> {
    await this.sleep(0);
    const orderBody = body as {
      vpsType?: string;
      osImage?: string;
      billingCycle?: number;
      hostname?: string;
    };

    if (!orderBody.vpsType || !orderBody.osImage) {
      this.sendError(res, 400, 'Missing required fields: vpsType, osImage');
      return;
    }

    // Check if product exists and is available
    const product = this.config.products.find((p) => p.id === orderBody.vpsType);
    if (!product) {
      this.sendError(res, 400, `Product ${orderBody.vpsType} not found`);
      return;
    }
    if (!product.available) {
      this.sendError(res, 400, `Product ${orderBody.vpsType} is not available`);
      return;
    }

    // Check balance
    if (this.config.balance < product.price.monthly) {
      this.sendError(res, 400, 'Insufficient balance');
      return;
    }

    // Create server
    const server = this.addServer({
      vpsType: orderBody.vpsType,
      osImage: orderBody.osImage,
      status: 'provisioning',
      name: orderBody.hostname ?? `vps-${this.nextServerId}`,
    });

    // Deduct balance
    this.config.balance -= product.price.monthly;

    // Simulate provisioning completion
    setTimeout(() => {
      const s = this.servers.get(server.id);
      if (s) {
        s.status = 'running';
      }
    }, 1000);

    this.sendJson(res, 201, {
      success: true,
      data: {
        serverId: server.id,
        ipv4: server.ipv4,
        password: `mock-password-${server.id}`,
      },
      message: 'VPS ordered successfully',
    });
  }

  /**
   * Handle server-specific requests
   */
  private async handleServerRequest(
    method: string,
    path: string,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    await this.sleep(0);
    const match = path.match(/\/servers\/(\d+)(?:\/(\w+)(?:\/(\w+))?)?/);
    if (!match) {
      this.sendError(res, 404, 'Not found');
      return;
    }

    const serverId = parseInt(match[1], 10);
    const action = match[2];
    const subAction = match[3];

    const server = this.servers.get(serverId);
    if (!server) {
      this.sendError(res, 404, `Server ${serverId} not found`);
      return;
    }

    switch (action) {
      case undefined:
        if (method === 'GET') {
          this.sendJson(res, 200, { success: true, data: server });
        } else if (method === 'DELETE') {
          this.servers.delete(serverId);
          this.sendJson(res, 200, { success: true, message: 'Server deleted' });
        }
        break;
      case 'status': {
        const status: ServerStatus = {
          status: server.status as 'running' | 'stopped' | 'provisioning' | 'error',
          uptime: server.status === 'running' ? 3600 : undefined,
        };
        this.sendJson(res, 200, { success: true, data: status });
        break;
      }
      case 'power':
        if (method === 'POST') {
          const powerBody = body as { powerType?: string };
          // Accept both old names (start/shutdown) and new names (on/off)
          if (powerBody.powerType === 'on' || powerBody.powerType === 'start') {
            server.status = 'running';
          } else if (powerBody.powerType === 'off' || powerBody.powerType === 'shutdown') {
            server.status = 'stopped';
          } else if (powerBody.powerType === 'reboot') {
            server.status = 'provisioning';
            setTimeout(() => {
              server.status = 'running';
            }, 500);
          }
          this.sendJson(res, 200, {
            success: true,
            message: `Power action ${powerBody.powerType} executed`,
          });
        }
        break;
      case 'snapshots':
        if (subAction === 'create' && method === 'POST') {
          const snapshotBody = body as { name?: string };
          const snapshot: Snapshot = {
            id: Date.now(),
            name: snapshotBody.name ?? `snapshot-${Date.now()}`,
            size: 10,
            createdAt: new Date().toISOString(),
            status: 'active',
          };
          const serverSnapshots = this.snapshots.get(serverId) ?? [];
          serverSnapshots.push(snapshot);
          this.snapshots.set(serverId, serverSnapshots);
          this.sendJson(res, 201, { success: true, data: snapshot });
        } else if (!subAction && method === 'GET') {
          const serverSnapshots = this.snapshots.get(serverId) ?? [];
          this.sendJson(res, 200, { success: true, data: serverSnapshots });
        }
        break;
      default:
        this.sendError(res, 404, 'Not found');
    }
  }

  /**
   * Parse request body
   */
  private async parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: MockResponse): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    this.sendJson(res, status, { success: false, error: message });
  }

  /**
   * Sleep helper
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create and start a mock API server for tests
 */
export async function createMockApi(
  config?: Partial<MockApiServerConfig>
): Promise<MockServersGuruApi> {
  const api = new MockServersGuruApi(config);
  await api.start();
  return api;
}
