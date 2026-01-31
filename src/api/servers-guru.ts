import type {
  ServersGuruConfig,
  ServerInfo,
  ServerStatus,
  VpsProduct,
  Snapshot,
  OrderResult,
} from '../config.js';

/**
 * Error thrown by Servers.guru API operations
 */
export class ServersGuruApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'ServersGuruApiError';
  }
}

/**
 * VPS order configuration
 */
export interface VpsOrderConfig {
  vpsType: string;
  osImage: string;
  billingCycle: number;
  hostname?: string;
}

/**
 * Power action type
 */
export type PowerAction = 'start' | 'shutdown' | 'reboot';

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Raw product format from Servers.guru API
 */
interface RawProduct {
  ProductId: number;
  Cpu: number;
  Ram: number;
  Ssd: number;
  Price: number;
  Arch: string;
  CpuModel: string;
  Bandwidth: number;
  Location: number;
}

/**
 * Raw server format from Servers.guru API
 */
interface RawServer {
  Id: number;
  Ipv4: string;
  Ipv6: string;
  Name: string;
  VCPU: number;
  Ram: number;
  DiskSize: number;
  CpuModel: string;
  Dc: string;
  Disabled: boolean;
  Created_at: string;
}

/**
 * Servers.guru API Client
 *
 * Provides typed access to the Servers.guru VPS management API.
 * Handles authentication, request formatting, and response parsing.
 */
export class ServersGuruClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ServersGuruConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://my.servers.guru/api';
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined && body !== null) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = (await response.json()) as { message?: string; error?: string };
        if ((errorData.message ?? '') !== '' || (errorData.error ?? '') !== '') {
          errorMessage = `${errorData.message ?? errorData.error} (${response.status})`;
        }
      } catch {
        // Ignore JSON parse errors for error response
      }
      throw new ServersGuruApiError(errorMessage, response.status);
    }

    const data = await response.json();
    return data as T;
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<number> {
    const response = await this.request<{ balance: number } | ApiResponse<{ balance: number }>>(
      'GET',
      '/users/balance'
    );
    // Handle both direct response and wrapped response formats
    if ('balance' in response && typeof response.balance === 'number') {
      return response.balance;
    }
    return (response as ApiResponse<{ balance: number }>).data?.balance ?? 0;
  }

  /**
   * List available VPS products
   */
  async getProducts(): Promise<VpsProduct[]> {
    // API returns object like {"FI1-1": {...}, "FI1-2": {...}}
    const response = await this.request<Record<string, RawProduct> | ApiResponse<VpsProduct[]>>(
      'GET',
      '/servers/vps/products'
    );

    // Handle object format (actual API)
    if (typeof response === 'object' && response !== null && !('data' in response)) {
      const products = response as Record<string, RawProduct>;
      return Object.entries(products).map(([id, product]) => ({
        id,
        name: id,
        cpu: product.Cpu,
        ram: product.Ram,
        disk: product.Ssd,
        bandwidth: product.Bandwidth,
        price: { monthly: product.Price, yearly: product.Price * 12 },
        locations: [String(product.Location)],
        available: product.ProductId > 0,
      }));
    }

    // Handle wrapped format (legacy)
    return (response as ApiResponse<VpsProduct[]>).data ?? [];
  }

  /**
   * List available OS images
   */
  async getImages(): Promise<string[]> {
    const response = await this.request<ApiResponse<string[]>>('GET', '/servers/vps/images');
    return response.data ?? [];
  }

  /**
   * List owned servers
   */
  async listServers(options?: {
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<ServerInfo[]> {
    let endpoint = '/servers';
    const params = new URLSearchParams();

    if (typeof options?.search === 'string' && options.search !== '') {
      params.set('search', options.search);
    }
    if (typeof options?.page === 'number' && options.page > 0) {
      params.set('page', options.page.toString());
    }
    if (typeof options?.perPage === 'number' && options.perPage > 0) {
      params.set('per_page', options.perPage.toString());
    }

    const queryString = params.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }

    // API returns {"Servers": [...], "Page": 0, "Total": n}
    const response = await this.request<{ Servers: RawServer[] } | ApiResponse<ServerInfo[]>>(
      'GET',
      endpoint
    );

    // Handle actual API format
    if ('Servers' in response && Array.isArray(response.Servers)) {
      return response.Servers.map((s: RawServer) => ({
        id: s.Id,
        name: s.Name || `server-${s.Id}`,
        ipv4: s.Ipv4,
        ipv6: s.Ipv6,
        status: s.Disabled ? 'disabled' : 'active',
        vpsType: `${s.VCPU}vCPU/${s.Ram}GB`,
        osImage: '',
        datacenter: s.Dc,
        createdAt: s.Created_at,
      }));
    }

    // Handle wrapped format (legacy)
    return (response as ApiResponse<ServerInfo[]>).data ?? [];
  }

  /**
   * Get server by ID
   */
  async getServer(id: number): Promise<ServerInfo> {
    const response = await this.request<ApiResponse<ServerInfo>>('GET', `/servers/${id}`);
    if (!response.data) {
      throw new ServersGuruApiError(`Server ${id} not found`, 404);
    }
    return response.data;
  }

  /**
   * Get server status
   */
  async getServerStatus(id: number): Promise<ServerStatus> {
    // API returns {"status": "running"} directly
    const response = await this.request<{ status: string } | ApiResponse<ServerStatus>>(
      'GET',
      `/servers/${id}/status`
    );

    // Handle direct format
    if ('status' in response && typeof response.status === 'string') {
      return { status: response.status };
    }

    // Handle wrapped format
    if ((response as ApiResponse<ServerStatus>).data) {
      return (response as ApiResponse<ServerStatus>).data!;
    }

    throw new ServersGuruApiError(`Unable to get status for server ${id}`);
  }

  /**
   * Order a new VPS
   * Note: The API returns {"success": true} on success, but doesn't return server details.
   * We need to poll the servers list to get the new server info.
   */
  async orderVps(config: VpsOrderConfig): Promise<OrderResult> {
    // Get current servers before ordering
    const serversBefore = await this.listServers();
    const existingIds = new Set(serversBefore.map((s) => s.id));

    const response = await this.request<
      | { success: boolean; error?: string }
      | ApiResponse<{
          serverId: number;
          ipv4: string;
          password: string;
        }>
    >('POST', '/servers/vps/order', {
      vpsType: config.vpsType,
      osImage: config.osImage,
      billingCycle: config.billingCycle,
      hostname: config.hostname,
    });

    // Handle direct success format (actual API)
    if ('success' in response && response.success === true) {
      // Poll for the new server (wait up to 60 seconds)
      const maxAttempts = 12;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await this.sleep(5000);
        const serversAfter = await this.listServers();
        const newServer = serversAfter.find((s) => !existingIds.has(s.id));
        if (newServer) {
          return {
            success: true,
            serverId: newServer.id,
            ipv4: newServer.ipv4,
            password: '', // Password not available via API, check dashboard
            message: 'VPS ordered successfully. Check dashboard for root password.',
          };
        }
      }
      throw new ServersGuruApiError('VPS ordered but could not find new server in list');
    }

    // Handle error
    if ('error' in response && typeof response.error === 'string' && response.error !== '') {
      throw new ServersGuruApiError(response.error);
    }

    // Handle wrapped format (legacy)
    const wrapped = response as ApiResponse<{ serverId: number; ipv4: string; password: string }>;
    if (!wrapped.success || !wrapped.data) {
      throw new ServersGuruApiError(wrapped.message ?? wrapped.error ?? 'Failed to order VPS');
    }

    return {
      success: true,
      serverId: wrapped.data.serverId,
      ipv4: wrapped.data.ipv4,
      password: wrapped.data.password,
      message: wrapped.message,
    };
  }

  /**
   * Perform power action on server
   */
  async powerAction(id: number, action: PowerAction): Promise<void> {
    // API uses "powerType" with values: "on", "off", "reboot"
    const powerTypeMap: Record<PowerAction, string> = {
      start: 'on',
      shutdown: 'off',
      reboot: 'reboot',
    };
    await this.request('POST', `/servers/${id}/power`, {
      powerType: powerTypeMap[action],
    });
  }

  /**
   * Start server
   */
  async startServer(id: number): Promise<void> {
    await this.powerAction(id, 'start');
  }

  /**
   * Stop server
   */
  async stopServer(id: number): Promise<void> {
    await this.powerAction(id, 'shutdown');
  }

  /**
   * Reboot server
   */
  async rebootServer(id: number): Promise<void> {
    await this.powerAction(id, 'reboot');
  }

  /**
   * Rebuild server with new OS
   */
  async rebuildServer(id: number, osImage: string): Promise<{ password: string }> {
    const response = await this.request<ApiResponse<{ password: string }>>(
      'POST',
      `/servers/${id}/rebuild`,
      { osImage }
    );
    if (!response.data) {
      throw new ServersGuruApiError('Rebuild failed: no password returned');
    }
    return response.data;
  }

  /**
   * List server snapshots
   */
  async listSnapshots(serverId: number): Promise<Snapshot[]> {
    const response = await this.request<ApiResponse<Snapshot[]>>(
      'GET',
      `/servers/${serverId}/snapshots`
    );
    return response.data ?? [];
  }

  /**
   * Create server snapshot
   */
  async createSnapshot(serverId: number, name?: string): Promise<Snapshot> {
    const response = await this.request<ApiResponse<Snapshot>>(
      'POST',
      `/servers/${serverId}/snapshots/create`,
      { name: name ?? `snapshot-${Date.now()}` }
    );
    if (!response.data) {
      throw new ServersGuruApiError('Failed to create snapshot');
    }
    return response.data;
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(serverId: number, snapshotId: number): Promise<void> {
    await this.request('DELETE', `/servers/${serverId}/snapshots/${snapshotId}`);
  }

  /**
   * Restore snapshot to server
   */
  async restoreSnapshot(
    serverId: number,
    snapshotId: number,
    targetServerId?: number
  ): Promise<void> {
    const target = targetServerId ?? serverId;
    await this.request('POST', `/servers/${serverId}/snapshots/${snapshotId}/restore/${target}`);
  }

  /**
   * Set reverse DNS
   */
  async setReverseDns(serverId: number, hostname: string): Promise<void> {
    await this.request('POST', `/servers/${serverId}/rdns`, { hostname });
  }

  /**
   * Wait for server to reach a specific status
   */
  async waitForStatus(
    serverId: number,
    targetStatus: string,
    options?: {
      timeout?: number;
      pollInterval?: number;
      onProgress?: (status: string) => void;
    }
  ): Promise<ServerStatus> {
    const timeout = options?.timeout ?? 600000; // 10 minutes default
    const pollInterval = options?.pollInterval ?? 10000; // 10 seconds default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getServerStatus(serverId);
      options?.onProgress?.(status.status);

      if (status.status === targetStatus) {
        return status;
      }

      if (status.status === 'error') {
        throw new ServersGuruApiError(`Server ${serverId} entered error state`);
      }

      await this.sleep(pollInterval);
    }

    throw new ServersGuruApiError(
      `Timeout waiting for server ${serverId} to reach status "${targetStatus}"`
    );
  }

  /**
   * Sleep helper
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
