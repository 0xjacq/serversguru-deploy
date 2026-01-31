/**
 * Pre-flight validation module for serversguru-deploy
 *
 * Performs checks before deployment to catch issues early
 * and provide actionable feedback to users.
 */

import { constants } from 'fs';
import { access, readFile } from 'fs/promises';

import { ServersGuruClient } from './api/servers-guru.js';
import type { DeploymentConfig } from './config.js';
import { getLogger } from './logger.js';

/**
 * Pre-flight check result
 */
export interface PreflightResult {
  /** Whether the check passed */
  passed: boolean;
  /** Check name */
  name: string;
  /** Result message */
  message: string;
  /** Suggestion if check failed */
  suggestion?: string;
  /** Error details if check failed */
  error?: Error;
  /** Time taken to run check in ms */
  duration: number;
}

/**
 * Pre-flight check definition
 */
export interface PreflightCheck {
  /** Unique check name */
  name: string;
  /** Check description */
  description: string;
  /** Whether this check is required (deployment will fail if required check fails) */
  required: boolean;
  /** Check function */
  run: (context: PreflightContext) => Promise<PreflightResult> | PreflightResult;
}

/**
 * Context passed to pre-flight checks
 */
export interface PreflightContext {
  /** Deployment configuration */
  config: DeploymentConfig;
  /** API client (if API key is available) */
  apiClient?: ServersGuruClient;
  /** Path to configuration file */
  configPath: string;
}

/**
 * Overall pre-flight check results
 */
export interface PreflightCheckResults {
  /** Whether all required checks passed */
  canProceed: boolean;
  /** Individual check results */
  results: PreflightResult[];
  /** Total time taken */
  totalDuration: number;
  /** Number of passed checks */
  passedCount: number;
  /** Number of failed checks */
  failedCount: number;
  /** Number of warnings */
  warningCount: number;
}

const logger = getLogger();

/**
 * Check if API key is configured and valid format
 */
const apiKeyCheck: PreflightCheck = {
  name: 'api-key',
  description: 'Verify API key is configured',
  required: true,
  run(context): PreflightResult {
    const start = Date.now();
    const apiKey = context.config.serversGuru.apiKey;

    if (!apiKey || apiKey === '') {
      return {
        passed: false,
        name: 'api-key',
        message: 'API key is not configured',
        suggestion:
          'Set SERVERSGURU_API_KEY environment variable or add apiKey to your config file',
        duration: Date.now() - start,
      };
    }

    if (apiKey.length < 10) {
      return {
        passed: false,
        name: 'api-key',
        message: 'API key appears to be invalid (too short)',
        suggestion: 'Verify your API key from https://my.servers.guru/account/api',
        duration: Date.now() - start,
      };
    }

    return {
      passed: true,
      name: 'api-key',
      message: 'API key is configured',
      duration: Date.now() - start,
    };
  },
};

/**
 * Check API connectivity and authentication
 */
const apiConnectivityCheck: PreflightCheck = {
  name: 'api-connectivity',
  description: 'Test connection to Servers.guru API',
  required: true,
  async run(context): Promise<PreflightResult> {
    const start = Date.now();

    if (!context.apiClient) {
      return {
        passed: false,
        name: 'api-connectivity',
        message: 'Cannot test API connectivity without API client',
        suggestion: 'Ensure API key is configured correctly',
        duration: Date.now() - start,
      };
    }

    try {
      // Try to get balance as a lightweight auth check
      await context.apiClient.getBalance();

      return {
        passed: true,
        name: 'api-connectivity',
        message: 'Successfully connected to Servers.guru API',
        duration: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('401') || message.includes('Unauthorized')) {
        return {
          passed: false,
          name: 'api-connectivity',
          message: 'API authentication failed',
          suggestion: 'Verify your API key is correct and active',
          error: error instanceof Error ? error : new Error(message),
          duration: Date.now() - start,
        };
      }

      if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
        return {
          passed: false,
          name: 'api-connectivity',
          message: 'Cannot connect to Servers.guru API',
          suggestion: 'Check your internet connection and firewall settings',
          error: error instanceof Error ? error : new Error(message),
          duration: Date.now() - start,
        };
      }

      return {
        passed: false,
        name: 'api-connectivity',
        message: `API connection failed: ${message}`,
        suggestion: 'Try again later or contact Servers.guru support',
        error: error instanceof Error ? error : new Error(message),
        duration: Date.now() - start,
      };
    }
  },
};

/**
 * Check account balance
 */
const balanceCheck: PreflightCheck = {
  name: 'account-balance',
  description: 'Verify sufficient account balance',
  required: true,
  async run(context): Promise<PreflightResult> {
    const start = Date.now();

    if (!context.apiClient) {
      return {
        passed: false,
        name: 'account-balance',
        message: 'Cannot check balance without API client',
        duration: Date.now() - start,
      };
    }

    try {
      const balance = await context.apiClient.getBalance();

      if (balance <= 0) {
        return {
          passed: false,
          name: 'account-balance',
          message: `Insufficient balance: $${balance.toFixed(2)}`,
          suggestion: 'Add funds to your account at https://my.servers.guru/billing',
          duration: Date.now() - start,
        };
      }

      if (balance < 10) {
        return {
          passed: true,
          name: 'account-balance',
          message: `Low balance: $${balance.toFixed(2)} (deployment may fail if balance runs out)`,
          suggestion: 'Consider adding more funds to your account',
          duration: Date.now() - start,
        };
      }

      return {
        passed: true,
        name: 'account-balance',
        message: `Sufficient balance: $${balance.toFixed(2)}`,
        duration: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        passed: false,
        name: 'account-balance',
        message: `Failed to check balance: ${message}`,
        suggestion: 'Try again later',
        error: error instanceof Error ? error : new Error(message),
        duration: Date.now() - start,
      };
    }
  },
};

/**
 * Check VPS product availability
 */
const vpsProductCheck: PreflightCheck = {
  name: 'vps-product',
  description: 'Verify VPS product is available',
  required: true,
  async run(context): Promise<PreflightResult> {
    const start = Date.now();
    const vpsType = context.config.vps.type;

    if (!context.apiClient) {
      return {
        passed: false,
        name: 'vps-product',
        message: 'Cannot check VPS product without API client',
        duration: Date.now() - start,
      };
    }

    try {
      const products = await context.apiClient.getProducts();
      const product = products.find((p) => p.id === vpsType);

      if (!product) {
        const availableTypes = products
          .filter((p) => p.available)
          .map((p) => p.id)
          .join(', ');

        return {
          passed: false,
          name: 'vps-product',
          message: `VPS type "${vpsType}" not found`,
          suggestion: `Available types: ${availableTypes}. Run "sg-deploy products" to see all options.`,
          duration: Date.now() - start,
        };
      }

      if (!product.available) {
        return {
          passed: false,
          name: 'vps-product',
          message: `VPS type "${vpsType}" is not currently available`,
          suggestion: 'Choose a different VPS type',
          duration: Date.now() - start,
        };
      }

      return {
        passed: true,
        name: 'vps-product',
        message: `VPS type "${vpsType}" is available ($${product.price.monthly}/month)`,
        duration: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        passed: false,
        name: 'vps-product',
        message: `Failed to check VPS product: ${message}`,
        suggestion: 'Try again later',
        error: error instanceof Error ? error : new Error(message),
        duration: Date.now() - start,
      };
    }
  },
};

/**
 * Check OS image availability
 */
const osImageCheck: PreflightCheck = {
  name: 'os-image',
  description: 'Verify OS image is available',
  required: true,
  async run(context): Promise<PreflightResult> {
    const start = Date.now();
    const osImage = context.config.vps.osImage;

    if (!context.apiClient) {
      return {
        passed: false,
        name: 'os-image',
        message: 'Cannot check OS image without API client',
        duration: Date.now() - start,
      };
    }

    try {
      const images = await context.apiClient.getImages();

      if (!images.includes(osImage)) {
        return {
          passed: false,
          name: 'os-image',
          message: `OS image "${osImage}" is not available`,
          suggestion: `Available images: ${images.join(', ')}. Run "sg-deploy images" to see all options.`,
          duration: Date.now() - start,
        };
      }

      return {
        passed: true,
        name: 'os-image',
        message: `OS image "${osImage}" is available`,
        duration: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        passed: false,
        name: 'os-image',
        message: `Failed to check OS image: ${message}`,
        suggestion: 'Try again later',
        error: error instanceof Error ? error : new Error(message),
        duration: Date.now() - start,
      };
    }
  },
};

/**
 * Check Docker image format
 */
const dockerImageCheck: PreflightCheck = {
  name: 'docker-image',
  description: 'Verify Docker image format',
  required: true,
  run(context): PreflightResult {
    const start = Date.now();
    const image = context.config.app.dockerImage;

    // Basic Docker image name validation
    const imageRegex =
      /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[\w.-]+)?$/i;

    if (!image || image === '') {
      return {
        passed: false,
        name: 'docker-image',
        message: 'Docker image is not specified',
        suggestion: 'Add dockerImage to your app configuration',
        duration: Date.now() - start,
      };
    }

    // Handle registry URLs
    const imageWithoutRegistry =
      image.includes('/') && image.includes('.') ? image.split('/').slice(1).join('/') : image;

    if (!imageRegex.test(imageWithoutRegistry) && !image.includes('@sha256:')) {
      return {
        passed: false,
        name: 'docker-image',
        message: `Docker image "${image}" appears to have invalid format`,
        suggestion: 'Use format: [registry/]name[:tag] or [registry/]name@sha256:digest',
        duration: Date.now() - start,
      };
    }

    return {
      passed: true,
      name: 'docker-image',
      message: `Docker image format is valid: ${image}`,
      duration: Date.now() - start,
    };
  },
};

/**
 * Check Docker registry credentials if needed
 */
const registryAuthCheck: PreflightCheck = {
  name: 'registry-auth',
  description: 'Verify Docker registry authentication',
  required: false,
  run(context): PreflightResult {
    const start = Date.now();
    const auth = context.config.app.registryAuth;

    if (!auth) {
      return {
        passed: true,
        name: 'registry-auth',
        message: 'No registry authentication configured (public images only)',
        duration: Date.now() - start,
      };
    }

    const missing: string[] = [];
    if (!auth.username || auth.username === '') {
      missing.push('username');
    }
    if (!auth.password || auth.password === '') {
      missing.push('password');
    }

    if (missing.length > 0) {
      return {
        passed: false,
        name: 'registry-auth',
        message: `Registry authentication incomplete: missing ${missing.join(', ')}`,
        suggestion: `Set DOCKER_REGISTRY_${missing[0].toUpperCase()} environment variable`,
        duration: Date.now() - start,
      };
    }

    return {
      passed: true,
      name: 'registry-auth',
      message: `Registry authentication configured for ${auth.registry}`,
      duration: Date.now() - start,
    };
  },
};

/**
 * Check domain DNS configuration
 */
const dnsCheck: PreflightCheck = {
  name: 'dns-resolution',
  description: 'Verify domain DNS configuration',
  required: false,
  run(context): PreflightResult {
    const start = Date.now();
    const domain = context.config.domain;

    if (!domain) {
      return {
        passed: true,
        name: 'dns-resolution',
        message: 'No domain configured (IP-only deployment)',
        duration: Date.now() - start,
      };
    }

    // DNS check would require dns.promises module
    // For now, just validate the domain format
    const domainRegex =
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

    if (!domainRegex.test(domain.name)) {
      return {
        passed: false,
        name: 'dns-resolution',
        message: `Domain "${domain.name}" appears to have invalid format`,
        suggestion: 'Use a valid domain name format (e.g., app.example.com)',
        duration: Date.now() - start,
      };
    }

    if (!domain.email?.includes('@')) {
      return {
        passed: false,
        name: 'dns-resolution',
        message: 'Invalid email for SSL certificate',
        suggestion: "Provide a valid email address for Let's Encrypt",
        duration: Date.now() - start,
      };
    }

    return {
      passed: true,
      name: 'dns-resolution',
      message: `Domain "${domain.name}" format is valid`,
      suggestion: 'Ensure DNS is configured to point to the server IP after deployment',
      duration: Date.now() - start,
    };
  },
};

/**
 * Check SSH key if configured
 */
const sshKeyCheck: PreflightCheck = {
  name: 'ssh-key',
  description: 'Verify SSH private key if configured',
  required: false,
  async run(context): Promise<PreflightResult> {
    const start = Date.now();
    const keyPath = context.config.ssh.privateKeyPath;

    if (!keyPath) {
      return {
        passed: true,
        name: 'ssh-key',
        message: 'Using password authentication (SSH key not configured)',
        duration: Date.now() - start,
      };
    }

    try {
      await access(keyPath, constants.R_OK);
      const content = await readFile(keyPath, 'utf-8');

      if (!content.includes('PRIVATE KEY')) {
        return {
          passed: false,
          name: 'ssh-key',
          message: `File at ${keyPath} does not appear to be a valid private key`,
          suggestion: 'Provide a valid SSH private key file',
          duration: Date.now() - start,
        };
      }

      return {
        passed: true,
        name: 'ssh-key',
        message: `SSH private key found at ${keyPath}`,
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        passed: false,
        name: 'ssh-key',
        message: `Cannot read SSH private key at ${keyPath}`,
        suggestion: 'Check the file path and permissions',
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - start,
      };
    }
  },
};

/**
 * All available pre-flight checks
 */
export const ALL_PREFLIGHT_CHECKS: PreflightCheck[] = [
  apiKeyCheck,
  apiConnectivityCheck,
  balanceCheck,
  vpsProductCheck,
  osImageCheck,
  dockerImageCheck,
  registryAuthCheck,
  dnsCheck,
  sshKeyCheck,
];

/**
 * Run all pre-flight checks
 */
export async function runPreflightChecks(
  config: DeploymentConfig,
  configPath: string,
  options?: {
    checks?: PreflightCheck[];
    skipOptional?: boolean;
  }
): Promise<PreflightCheckResults> {
  const start = Date.now();
  const checks = options?.checks ?? ALL_PREFLIGHT_CHECKS;

  // Create API client if possible
  let apiClient: ServersGuruClient | undefined;
  try {
    apiClient = new ServersGuruClient(config.serversGuru);
  } catch {
    // API client creation failed, checks will handle this
  }

  const context: PreflightContext = {
    config,
    configPath,
    apiClient,
  };

  logger.info('Running pre-flight checks...');

  const results: PreflightResult[] = [];

  for (const check of checks) {
    if (options?.skipOptional && !check.required) {
      continue;
    }

    logger.debug(`Running check: ${check.name}`);

    try {
      const result = await check.run(context);
      results.push(result);

      if (result.passed) {
        logger.info(`✓ ${check.name}: ${result.message}`);
      } else if (check.required) {
        logger.error(`✗ ${check.name}: ${result.message}`, {
          metadata: { suggestion: result.suggestion },
        });
      } else {
        logger.warn(`⚠ ${check.name}: ${result.message}`, {
          metadata: { suggestion: result.suggestion },
        });
      }
    } catch (error) {
      const result: PreflightResult = {
        passed: false,
        name: check.name,
        message: `Check failed with error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: 0,
      };
      results.push(result);
      logger.error(`✗ ${check.name}: ${result.message}`);
    }
  }

  const failedRequired = results.filter(
    (r) => !r.passed && checks.find((c) => c.name === r.name)?.required
  );
  const failedOptional = results.filter(
    (r) => !r.passed && !checks.find((c) => c.name === r.name)?.required
  );

  const totalDuration = Date.now() - start;

  logger.info(`Pre-flight checks completed in ${totalDuration}ms`);

  return {
    canProceed: failedRequired.length === 0,
    results,
    totalDuration,
    passedCount: results.filter((r) => r.passed).length,
    failedCount: failedRequired.length,
    warningCount: failedOptional.length,
  };
}

/**
 * Format pre-flight results for console output
 */
export function formatPreflightResults(results: PreflightCheckResults): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('Pre-flight Check Results');
  lines.push('='.repeat(50));

  for (const result of results.results) {
    const icon = result.passed ? '✓' : '✗';
    lines.push(`${icon} ${result.name}: ${result.message}`);
    if (result.suggestion) {
      lines.push(`  → ${result.suggestion}`);
    }
  }

  lines.push('='.repeat(50));
  lines.push(
    `Passed: ${results.passedCount}, Failed: ${results.failedCount}, Warnings: ${results.warningCount}`
  );
  lines.push(`Total time: ${results.totalDuration}ms`);

  if (results.canProceed) {
    lines.push('✓ All required checks passed. Ready to deploy!');
  } else {
    lines.push('✗ Some required checks failed. Please fix the issues above before deploying.');
  }

  return lines.join('\n');
}
