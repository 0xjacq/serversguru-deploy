import type {
  ServersGuruConfig,
  ServerInfo,
  ServerStatus,
  VpsProduct,
  Snapshot,
  OrderResult,
  IpInfo,
  Backup,
  Iso,
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
  Dedicated: boolean;
  Backup: number;
  Snapshot: number;
  Speed: number;
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
  Expire_at?: string;
  Term?: number;
  Price?: number;
  Rdns?: string;
}

/**
 * Raw snapshot format from Servers.guru API
 */
interface RawSnapshot {
  id: number;
  name: string;
  created: string;
  id_user: number;
  id_server: number;
  expiration_date: string;
  active: boolean;
  disabled: boolean;
  status: string;
  is_protection: boolean;
  price: number;
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
        arch: product.Arch,
        cpuModel: product.CpuModel,
        dedicated: product.Dedicated ?? false,
        backupPrice: product.Backup ?? 0,
        snapshotPrice: product.Snapshot ?? 0,
        speed: product.Speed ?? 1,
        location: product.Location,
      }));
    }

    // Handle wrapped format (legacy)
    return (response as ApiResponse<VpsProduct[]>).data ?? [];
  }

  /**
   * List available OS images
   */
  async getImages(): Promise<string[]> {
    const response = await this.request<string[] | ApiResponse<string[]>>(
      'GET',
      '/servers/vps/images'
    );
    // Handle direct array format (actual API)
    if (Array.isArray(response)) {
      return response;
    }
    // Handle wrapped format (legacy)
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
        expireAt: s.Expire_at,
        term: s.Term,
        price: s.Price,
        rdns: s.Rdns,
        cpu: s.VCPU,
        ram: s.Ram,
        diskSize: s.DiskSize,
        cpuModel: s.CpuModel,
        disabled: s.Disabled,
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

    // Handle wrapped format (legacy) - has data field with server details
    if ('data' in response && response.data) {
      const data = response.data as { serverId: number; ipv4: string; password: string };
      return {
        success: true,
        serverId: data.serverId,
        ipv4: data.ipv4,
        password: data.password,
        message: (response as ApiResponse<unknown>).message,
      };
    }

    // Handle direct success format (actual API) - no data field, just {success: true}
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

    // Handle wrapped format failure
    const wrapped = response as ApiResponse<{ serverId: number; ipv4: string; password: string }>;
    if (!wrapped.success) {
      throw new ServersGuruApiError(wrapped.message ?? wrapped.error ?? 'Failed to order VPS');
    }

    throw new ServersGuruApiError('Unexpected response format from orderVps API');
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
    const response = await this.request<{ password: string } | ApiResponse<{ password: string }>>(
      'POST',
      `/servers/${id}/rebuild`,
      { image: osImage }
    );
    // Handle direct format (actual API)
    if ('password' in response && typeof response.password === 'string') {
      return { password: response.password };
    }
    // Handle wrapped format (legacy)
    const wrapped = response as ApiResponse<{ password: string }>;
    if (!wrapped.data) {
      throw new ServersGuruApiError('Rebuild failed: no password returned');
    }
    return wrapped.data;
  }

  /**
   * List server snapshots
   */
  async listSnapshots(serverId: number): Promise<Snapshot[]> {
    const response = await this.request<RawSnapshot[] | ApiResponse<Snapshot[]>>(
      'GET',
      `/servers/${serverId}/snapshots`
    );
    // Handle direct array format (actual API)
    if (Array.isArray(response)) {
      return response.map((s: RawSnapshot) => ({
        id: s.id,
        name: s.name,
        size: 0, // Not provided by API
        createdAt: s.created,
        status: s.status,
        userId: s.id_user,
        serverId: s.id_server,
        expirationDate: s.expiration_date,
        active: s.active,
        disabled: s.disabled,
        isProtection: s.is_protection,
        price: s.price,
      }));
    }
    // Handle wrapped format (legacy)
    return response.data ?? [];
  }

  /**
   * Create server snapshot
   * Note: The actual API returns { success: true } only. We poll the snapshots list to find the new snapshot.
   */
  async createSnapshot(serverId: number, name?: string): Promise<Snapshot> {
    const snapshotName = name ?? `snapshot-${Date.now()}`;

    // Get current snapshots before creating
    const snapshotsBefore = await this.listSnapshots(serverId);
    const existingIds = new Set(snapshotsBefore.map((s) => s.id));

    const response = await this.request<{ success: boolean } | ApiResponse<Snapshot>>(
      'POST',
      `/servers/${serverId}/snapshots/create`,
      { name: snapshotName }
    );

    // Handle wrapped format (legacy) - has data field with snapshot details
    if ('data' in response && response.data) {
      return response.data;
    }

    // Handle direct success format (actual API) - poll for the new snapshot
    if ('success' in response && response.success === true) {
      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await this.sleep(5000);
        const snapshotsAfter = await this.listSnapshots(serverId);
        const newSnapshot = snapshotsAfter.find((s) => !existingIds.has(s.id));
        if (newSnapshot) {
          return newSnapshot;
        }
      }
      // If we can't find it by polling, return a placeholder with the name
      return {
        id: Date.now(),
        name: snapshotName,
        size: 0,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
    }

    throw new ServersGuruApiError('Failed to create snapshot');
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
  async setReverseDns(serverId: number, rdns: string): Promise<void> {
    await this.request('POST', `/servers/${serverId}/rdns/edit`, { rdns });
  }

  /**
   * Reset root password (rescue mode)
   * @returns The new root password
   */
  async resetPassword(serverId: number): Promise<{ password: string }> {
    const response = await this.request<{ password: string }>(
      'POST',
      `/servers/${serverId}/rescue/password`
    );
    return response;
  }

  /**
   * Cancel server at end of billing term
   */
  async cancelServer(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/cancel`);
  }

  /**
   * Remove cancellation from server
   */
  async uncancelServer(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/uncancel`);
  }

  /**
   * Rename server
   */
  async renameServer(serverId: number, name: string): Promise<void> {
    await this.request('POST', `/servers/${serverId}/editname`, { name });
  }

  /**
   * Change billing cycle
   * @param billingCycle Number of months (1-12)
   */
  async changeBillingCycle(serverId: number, billingCycle: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/term`, { billingCycle });
  }

  /**
   * Enable server protection
   */
  async enableProtection(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/protection/enable`);
  }

  /**
   * Disable server protection
   */
  async disableProtection(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/protection/disable`);
  }

  /**
   * Get available upgrades for a server
   */
  async getAvailableUpgrades(serverId: number): Promise<unknown> {
    return this.request('GET', `/servers/${serverId}/upgrade`);
  }

  /**
   * Process server upgrade
   * @param plan Target plan identifier
   * @param upgradeType "nodisk" or "disk" (if disk must be upgraded too)
   */
  async processUpgrade(
    serverId: number,
    plan: string,
    upgradeType: 'nodisk' | 'disk'
  ): Promise<void> {
    await this.request('POST', `/servers/${serverId}/upgrade`, {
      plan,
      upgrade: upgradeType,
    });
  }

  // ==================== Network/IP Methods ====================

  /**
   * List IP addresses for a server
   */
  async listIps(serverId: number): Promise<IpInfo[]> {
    interface RawIp {
      id: number;
      address: string;
      type: 'ipv4' | 'ipv6';
      rdns?: string;
      price: number;
      active: number;
      blocked: number;
      created: string;
      expiration_date?: string;
    }
    const response = await this.request<RawIp[]>('GET', `/servers/${serverId}/ips`);
    return response.map((ip) => ({
      id: ip.id,
      address: ip.address,
      type: ip.type,
      rdns: ip.rdns,
      price: ip.price,
      active: ip.active === 1,
      blocked: ip.blocked === 1,
      createdAt: ip.created,
      expirationDate: ip.expiration_date,
    }));
  }

  /**
   * Order additional IP address
   * @param ipType 'ipv4' or 'ipv6'
   */
  async orderIp(serverId: number, ipType: 'ipv4' | 'ipv6'): Promise<void> {
    await this.request('POST', `/servers/${serverId}/ips/order`, { ipType });
  }

  /**
   * Update reverse DNS for a specific IP
   */
  async updateIpRdns(serverId: number, ipId: number, rdns: string): Promise<void> {
    await this.request('POST', `/servers/${serverId}/ips/rdns/edit`, { ipId, rdns });
  }

  /**
   * Delete an additional IP address
   */
  async deleteIp(serverId: number, ipId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/ips/${ipId}/delete`);
  }

  /**
   * Reset reverse DNS for an IP to default
   */
  async resetIpRdns(serverId: number, ipId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/ips/${ipId}/rdns/reset`);
  }

  // ==================== ISO Methods ====================

  /**
   * List available ISOs for a server
   */
  async listIsos(serverId: number, options?: { page?: number; search?: string }): Promise<Iso[]> {
    let endpoint = `/servers/${serverId}/isos`;
    if (options?.search) {
      endpoint += `/search/${encodeURIComponent(options.search)}`;
    }
    if (options?.page !== undefined) {
      endpoint += `/page/${options.page}`;
    }
    return this.request<Iso[]>('GET', endpoint);
  }

  /**
   * Mount an ISO to a server
   */
  async mountIso(serverId: number, isoId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/isos/mount/${isoId}`);
  }

  /**
   * Unmount current ISO from server
   */
  async unmountIso(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/isos/unmount`);
  }

  // ==================== Backup Methods ====================

  /**
   * List backups for a server
   */
  async listBackups(serverId: number): Promise<Backup[]> {
    interface RawBackup {
      name: string;
      description?: string;
      created: string;
      disk_size: number;
      image_size: number;
      status: string;
      id_server: number;
      hetzner_id: number;
    }
    const response = await this.request<RawBackup[]>('GET', `/servers/${serverId}/backups`);
    return response.map((b) => ({
      id: b.hetzner_id,
      name: b.name,
      description: b.description,
      createdAt: b.created,
      diskSize: b.disk_size,
      imageSize: b.image_size,
      status: b.status,
      serverId: b.id_server,
    }));
  }

  /**
   * Enable automatic backups for a server
   */
  async enableBackups(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/backups/enable`);
  }

  /**
   * Disable automatic backups for a server
   */
  async disableBackups(serverId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/backups/disable`);
  }

  /**
   * Delete a backup
   */
  async deleteBackup(serverId: number, backupId: number): Promise<void> {
    await this.request('POST', `/servers/${serverId}/backups/${backupId}/delete`);
  }

  /**
   * Restore a backup to the server
   * @returns The process ID (upid) for tracking restoration status
   */
  async restoreBackup(serverId: number, backupId: number): Promise<{ upid: number }> {
    return this.request<{ upid: number }>(
      'POST',
      `/servers/${serverId}/backups/${backupId}/restore`
    );
  }

  /**
   * Get backup/restore task status
   */
  async getBackupStatus(
    serverId: number,
    upid: string
  ): Promise<{ completed: boolean; percent: number }> {
    return this.request<{ completed: boolean; percent: number }>(
      'GET',
      `/servers/${serverId}/backups/${upid}/status`
    );
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
