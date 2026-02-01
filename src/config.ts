import { z } from 'zod';

/**
 * Servers.guru API configuration schema
 */
export const ServersGuruConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().default('https://my.servers.guru/api'),
});

/**
 * VPS configuration schema
 */
export const VpsConfigSchema = z.object({
  type: z.string().min(1, 'VPS type is required (e.g., "NL1-2")'),
  osImage: z.string().min(1, 'OS image is required (e.g., "ubuntu-22.04")'),
  billingCycle: z.number().int().min(1).max(12).default(1),
  hostname: z.string().optional(),
});

/**
 * Docker registry authentication schema
 */
export const RegistryAuthSchema = z.object({
  username: z.string(),
  password: z.string(),
  registry: z.string().default('ghcr.io'),
});

/**
 * Application configuration schema
 */
export const AppConfigSchema = z.object({
  name: z.string().min(1, 'Application name is required'),
  dockerImage: z.string().min(1, 'Docker image is required'),
  registryAuth: RegistryAuthSchema.optional(),
  envVars: z.record(z.string()).default({}),
  healthEndpoint: z.string().default('/api/status'),
  port: z.number().int().min(1).max(65535).default(3000),
  volumes: z.array(z.string()).default([]),
});

/**
 * Domain/SSL configuration schema
 */
export const DomainConfigSchema = z.object({
  name: z.string().min(1, 'Domain name is required'),
  email: z.string().email("Valid email required for Let's Encrypt"),
});

/**
 * SSH configuration schema
 */
export const SshConfigSchema = z.object({
  port: z.number().int().default(22),
  username: z.string().default('root'),
  privateKeyPath: z.string().optional(),
  connectionTimeout: z.number().int().default(30000),
  commandTimeout: z.number().int().default(300000),
});

/**
 * Complete deployment configuration schema
 */
export const DeploymentConfigSchema = z.object({
  // Servers.guru credentials
  serversGuru: ServersGuruConfigSchema,

  // VPS Configuration
  vps: VpsConfigSchema,

  // SSH Configuration
  ssh: SshConfigSchema.default({}),

  // Application Configuration
  app: AppConfigSchema,

  // Domain/SSL (optional)
  domain: DomainConfigSchema.optional(),

  // Deployment options
  options: z
    .object({
      createSnapshot: z.boolean().default(true),
      healthCheckRetries: z.number().int().default(10),
      healthCheckInterval: z.number().int().default(5000),
      provisioningTimeout: z.number().int().default(600000), // 10 minutes
      setupTimeout: z.number().int().default(900000), // 15 minutes
    })
    .default({}),
});

// Export types
export type ServersGuruConfig = z.infer<typeof ServersGuruConfigSchema>;
export type VpsConfig = z.infer<typeof VpsConfigSchema>;
export type RegistryAuth = z.infer<typeof RegistryAuthSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type DomainConfig = z.infer<typeof DomainConfigSchema>;
export type SshConfig = z.infer<typeof SshConfigSchema>;
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

/**
 * Server information returned from API
 */
export interface ServerInfo {
  id: number;
  name: string;
  status: string;
  ipv4: string;
  ipv6?: string;
  password?: string;
  osImage: string;
  vpsType: string;
  datacenter: string;
  createdAt: string;
  /** Expiration date */
  expireAt?: string;
  /** Billing term in months */
  term?: number;
  /** Monthly price */
  price?: number;
  /** Reverse DNS hostname */
  rdns?: string;
  /** CPU count */
  cpu?: number;
  /** RAM in GB */
  ram?: number;
  /** Disk size in GB */
  diskSize?: number;
  /** CPU model */
  cpuModel?: string;
  /** Whether server is disabled */
  disabled?: boolean;
}

/**
 * Server status response
 */
export interface ServerStatus {
  status: 'running' | 'stopped' | 'provisioning' | 'error' | (string & {});
  uptime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
}

/**
 * VPS product information
 */
export interface VpsProduct {
  id: string;
  name: string;
  cpu: number;
  ram: number;
  disk: number;
  bandwidth: number;
  price: {
    monthly: number;
    yearly: number;
  };
  locations: string[];
  available: boolean;
  /** CPU architecture (x86, arm64, etc.) */
  arch: string;
  /** CPU model name */
  cpuModel: string;
  /** Whether this is a dedicated server */
  dedicated: boolean;
  /** Monthly backup price */
  backupPrice: number;
  /** Monthly snapshot price */
  snapshotPrice: number;
  /** Network speed in Gbps */
  speed: number;
  /** Location/datacenter ID */
  location: number;
}

/**
 * Snapshot information
 */
export interface Snapshot {
  id: number;
  name: string;
  size: number;
  createdAt: string;
  status: string;
  /** User ID who owns this snapshot */
  userId?: number;
  /** Server ID this snapshot belongs to */
  serverId?: number;
  /** Expiration date */
  expirationDate?: string;
  /** Whether snapshot is active */
  active?: boolean;
  /** Whether snapshot is disabled */
  disabled?: boolean;
  /** Whether this is a protection snapshot */
  isProtection?: boolean;
  /** Monthly price for this snapshot */
  price?: number;
}

/**
 * IP address information
 */
export interface IpInfo {
  id: number;
  address: string;
  type: 'ipv4' | 'ipv6';
  rdns?: string;
  price: number;
  active: boolean;
  blocked: boolean;
  createdAt: string;
  expirationDate?: string;
}

/**
 * Backup information
 */
export interface Backup {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  diskSize: number;
  imageSize: number;
  status: string;
  serverId: number;
}

/**
 * ISO image information
 */
export interface Iso {
  id: number;
  name: string;
  description?: string;
  size?: number;
}

/**
 * Order result
 */
export interface OrderResult {
  success: boolean;
  serverId: number;
  ipv4: string;
  password: string;
  message?: string;
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean;
  serverId: number;
  serverIp: string;
  snapshotId?: number;
  healthCheckPassed: boolean;
  deployedAt: string;
  appUrl?: string;
  errors: string[];
  logs: string[];
}

/**
 * SSH execution result
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}

/**
 * Deployment step status
 */
export type DeploymentStep =
  | 'check-balance'
  | 'order-vps'
  | 'wait-provisioning'
  | 'wait-ssh'
  | 'setup-server'
  | 'deploy-application'
  | 'configure-nginx'
  | 'obtain-ssl'
  | 'health-check'
  | 'create-snapshot'
  | 'complete';

/**
 * Deployment progress callback
 */
export type ProgressCallback = (step: DeploymentStep, message: string, progress?: number) => void;
