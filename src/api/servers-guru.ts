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
    const response = await this.request<ApiResponse<{ balance: number }>>('GET', '/users/balance');
    return response.data?.balance ?? 0;
  }

  /**
   * List available VPS products
   */
  async getProducts(): Promise<VpsProduct[]> {
    const response = await this.request<ApiResponse<VpsProduct[]>>('GET', '/servers/vps/products');
    return response.data ?? [];
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

    const response = await this.request<ApiResponse<ServerInfo[]>>('GET', endpoint);
    return response.data ?? [];
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
    const response = await this.request<ApiResponse<ServerStatus>>('GET', `/servers/${id}/status`);
    if (!response.data) {
      throw new ServersGuruApiError(`Unable to get status for server ${id}`);
    }
    return response.data;
  }

  /**
   * Order a new VPS
   */
  async orderVps(config: VpsOrderConfig): Promise<OrderResult> {
    const response = await this.request<
      ApiResponse<{
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

    if (!response.success || !response.data) {
      throw new ServersGuruApiError(response.message ?? response.error ?? 'Failed to order VPS');
    }

    return {
      success: true,
      serverId: response.data.serverId,
      ipv4: response.data.ipv4,
      password: response.data.password,
      message: response.message,
    };
  }

  /**
   * Perform power action on server
   */
  async powerAction(id: number, action: PowerAction): Promise<void> {
    await this.request('POST', `/servers/${id}/power`, {
      powerType: action,
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
