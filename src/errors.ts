/**
 * Error handling module for serversguru-deploy
 *
 * Provides structured, actionable error types with context,
 * suggestions for resolution, and documentation links.
 */

/**
 * Error severity levels
 */
export type ErrorSeverity = 'error' | 'warning' | 'info';

/**
 * Error context information
 */
export interface ErrorContext {
  /** The deployment step where the error occurred */
  step?: string;
  /** Server ID if applicable */
  serverId?: number;
  /** Server IP if applicable */
  serverIp?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Structured error options
 */
export interface DeploymentErrorOptions {
  /** Machine-readable error code */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggestion for fixing the error */
  suggestion?: string;
  /** URL to documentation */
  docsUrl?: string;
  /** Error severity */
  severity?: ErrorSeverity;
  /** Original error that caused this */
  cause?: Error;
  /** Additional context */
  context?: ErrorContext;
}

/**
 * All possible error codes
 */
export type ErrorCode =
  // API Errors
  | 'API_KEY_INVALID'
  | 'API_KEY_MISSING'
  | 'API_RATE_LIMIT'
  | 'API_TIMEOUT'
  | 'API_UNKNOWN_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'VPS_PRODUCT_UNAVAILABLE'
  | 'VPS_IMAGE_UNAVAILABLE'
  // VPS Errors
  | 'VPS_ORDER_FAILED'
  | 'VPS_PROVISIONING_FAILED'
  | 'VPS_PROVISIONING_TIMEOUT'
  | 'SERVER_NOT_FOUND'
  | 'SERVER_ERROR_STATE'
  // SSH Errors
  | 'SSH_CONNECTION_TIMEOUT'
  | 'SSH_CONNECTION_REFUSED'
  | 'SSH_AUTH_FAILED'
  | 'SSH_HOST_KEY_MISMATCH'
  | 'SSH_COMMAND_TIMEOUT'
  | 'SSH_COMMAND_FAILED'
  | 'SSH_FILE_TRANSFER_FAILED'
  // Docker Errors
  | 'DOCKER_NOT_INSTALLED'
  | 'DOCKER_PULL_FAILED'
  | 'DOCKER_LOGIN_FAILED'
  | 'DOCKER_COMPOSE_FAILED'
  | 'CONTAINER_UNHEALTHY'
  | 'CONTAINER_START_FAILED'
  // Nginx Errors
  | 'NGINX_CONFIG_INVALID'
  | 'NGINX_RELOAD_FAILED'
  // SSL Errors
  | 'SSL_CERTIFICATE_FAILED'
  | 'SSL_DNS_VERIFICATION_FAILED'
  | 'SSL_RATE_LIMIT'
  // Config Errors
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'CONFIG_VALIDATION_FAILED'
  | 'ENV_VAR_MISSING'
  // Health Check Errors
  | 'HEALTH_CHECK_FAILED'
  | 'HEALTH_CHECK_TIMEOUT'
  // Snapshot Errors
  | 'SNAPSHOT_CREATE_FAILED'
  | 'SNAPSHOT_RESTORE_FAILED'
  | 'SNAPSHOT_NOT_FOUND'
  // Generic Errors
  | 'DEPLOYMENT_CANCELLED'
  | 'DEPLOYMENT_TIMEOUT'
  | 'UNKNOWN_ERROR';

/**
 * Documentation URLs for error codes
 */
const ERROR_DOCS: Partial<Record<ErrorCode, string>> = {
  API_KEY_INVALID:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/API_KEY_INVALID.md',
  API_KEY_MISSING:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/API_KEY_MISSING.md',
  INSUFFICIENT_BALANCE:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/INSUFFICIENT_BALANCE.md',
  SSH_CONNECTION_TIMEOUT:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/SSH_CONNECTION_TIMEOUT.md',
  SSH_AUTH_FAILED:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/SSH_AUTH_FAILED.md',
  DOCKER_PULL_FAILED:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/DOCKER_PULL_FAILED.md',
  HEALTH_CHECK_FAILED:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/HEALTH_CHECK_FAILED.md',
  SSL_CERTIFICATE_FAILED:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/SSL_CERTIFICATE_FAILED.md',
  CONFIG_INVALID:
    'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/CONFIG_INVALID.md',
};

/**
 * Default suggestions for error codes
 */
const ERROR_SUGGESTIONS: Partial<Record<ErrorCode, string>> = {
  API_KEY_INVALID:
    'Check that your SERVERSGURU_API_KEY environment variable is set correctly. Verify the key in your Servers.guru dashboard.',
  API_KEY_MISSING:
    'Set the SERVERSGURU_API_KEY environment variable with your API key from https://my.servers.guru',
  API_RATE_LIMIT: 'Wait a few minutes before retrying. Consider adding delays between API calls.',
  INSUFFICIENT_BALANCE: 'Add funds to your Servers.guru account at https://my.servers.guru/billing',
  VPS_PRODUCT_UNAVAILABLE:
    'The requested VPS type is not available. Run "sg-deploy products" to see available options.',
  VPS_PROVISIONING_TIMEOUT:
    'The VPS is taking longer than expected. Check server status manually or contact Servers.guru support.',
  SSH_CONNECTION_TIMEOUT:
    'Check that the server is running, firewall allows SSH (port 22), and the IP address is correct.',
  SSH_CONNECTION_REFUSED:
    'SSH service may not be ready yet. Wait a few minutes and retry, or check server status.',
  SSH_AUTH_FAILED:
    'Verify the server password or SSH key. For new servers, ensure provisioning is complete.',
  DOCKER_PULL_FAILED:
    'Check Docker image name/tag, verify registry credentials, and ensure the image exists.',
  DOCKER_LOGIN_FAILED:
    'Verify DOCKER_REGISTRY_USERNAME and DOCKER_REGISTRY_PASSWORD environment variables.',
  CONTAINER_UNHEALTHY:
    'Check application logs with "docker logs <container>". Verify the health endpoint is correct.',
  HEALTH_CHECK_FAILED:
    'Verify the health endpoint URL and that the application is running on the correct port.',
  SSL_CERTIFICATE_FAILED:
    'Ensure DNS is correctly configured and propagated. Check that port 80 is accessible for ACME challenge.',
  SSL_DNS_VERIFICATION_FAILED:
    'Verify domain DNS records point to the server IP. DNS propagation can take up to 24 hours.',
  CONFIG_NOT_FOUND:
    'Create a configuration file with "sg-deploy init" or specify the path with --config.',
  CONFIG_VALIDATION_FAILED:
    'Check the configuration file syntax and required fields. Run with --dry-run to validate.',
  ENV_VAR_MISSING:
    'Set the required environment variable. Check documentation for required variables.',
};

/**
 * Base deployment error class with structured information
 */
export class DeploymentError extends Error {
  /** Machine-readable error code */
  readonly code: ErrorCode;
  /** Suggestion for fixing the error */
  readonly suggestion?: string;
  /** URL to documentation */
  readonly docsUrl?: string;
  /** Error severity */
  readonly severity: ErrorSeverity;
  /** Original error that caused this */
  readonly cause?: Error;
  /** Additional context */
  readonly context?: ErrorContext;
  /** Timestamp when the error occurred */
  readonly timestamp: string;

  constructor(options: DeploymentErrorOptions) {
    super(options.message);
    this.name = 'DeploymentError';
    this.code = options.code;
    this.suggestion = options.suggestion ?? ERROR_SUGGESTIONS[options.code];
    this.docsUrl = options.docsUrl ?? ERROR_DOCS[options.code];
    this.severity = options.severity ?? 'error';
    this.cause = options.cause;
    this.context = options.context;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeploymentError);
    }
  }

  /**
   * Format error for console output
   */
  toConsoleString(): string {
    const lines: string[] = [`Error [${this.code}]: ${this.message}`];

    if (this.context?.step) {
      lines.push(`  Step: ${this.context.step}`);
    }
    if (this.context?.serverId) {
      lines.push(`  Server ID: ${this.context.serverId}`);
    }
    if (this.context?.serverIp) {
      lines.push(`  Server IP: ${this.context.serverIp}`);
    }

    if (this.suggestion) {
      lines.push(`\n  Suggestion: ${this.suggestion}`);
    }

    if (this.docsUrl) {
      lines.push(`  Documentation: ${this.docsUrl}`);
    }

    if (this.cause) {
      lines.push(`\n  Caused by: ${this.cause.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Format error for JSON output
   */
  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        severity: this.severity,
        suggestion: this.suggestion,
        docsUrl: this.docsUrl,
        timestamp: this.timestamp,
        context: this.context,
        cause: this.cause?.message,
      },
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends DeploymentError {
  constructor(options: Omit<DeploymentErrorOptions, 'code'> & { code?: ErrorCode }) {
    super({
      ...options,
      code: options.code ?? 'CONFIG_INVALID',
    });
    this.name = 'ConfigError';
  }
}

/**
 * API-related errors
 */
export class ApiError extends DeploymentError {
  /** HTTP status code if applicable */
  readonly statusCode?: number;
  /** API response body if available */
  readonly response?: unknown;

  constructor(options: DeploymentErrorOptions & { statusCode?: number; response?: unknown }) {
    super(options);
    this.name = 'ApiError';
    this.statusCode = options.statusCode;
    this.response = options.response;
  }
}

/**
 * SSH-related errors
 */
export class SshError extends DeploymentError {
  constructor(options: Omit<DeploymentErrorOptions, 'code'> & { code?: ErrorCode }) {
    super({
      ...options,
      code: options.code ?? 'SSH_CONNECTION_TIMEOUT',
    });
    this.name = 'SshError';
  }
}

/**
 * Validation error for configuration issues
 */
export class ValidationError extends DeploymentError {
  /** Validation errors by field */
  readonly fieldErrors: Record<string, string[]>;

  constructor(options: DeploymentErrorOptions & { fieldErrors?: Record<string, string[]> }) {
    super({
      ...options,
      code: options.code ?? 'CONFIG_VALIDATION_FAILED',
    });
    this.name = 'ValidationError';
    this.fieldErrors = options.fieldErrors ?? {};
  }

  override toConsoleString(): string {
    const base = super.toConsoleString();
    const fieldErrors = Object.entries(this.fieldErrors)
      .map(([field, errors]) => `    - ${field}: ${errors.join(', ')}`)
      .join('\n');

    return fieldErrors ? `${base}\n  Field errors:\n${fieldErrors}` : base;
  }
}

/**
 * Aggregate error for multiple failures
 */
export class AggregateDeploymentError extends DeploymentError {
  /** Individual errors that occurred */
  readonly errors: DeploymentError[];

  constructor(errors: DeploymentError[], context?: ErrorContext) {
    const codes = errors.map((e) => e.code).join(', ');
    super({
      code: 'UNKNOWN_ERROR',
      message: `Multiple errors occurred: ${codes}`,
      context,
    });
    this.name = 'AggregateDeploymentError';
    this.errors = errors;
  }

  override toConsoleString(): string {
    const lines = [`Multiple errors occurred during deployment:`];
    this.errors.forEach((err, i) => {
      lines.push(`\n[${i + 1}/${this.errors.length}] ${err.toConsoleString()}`);
    });
    return lines.join('\n');
  }
}

/**
 * Helper function to wrap unknown errors into DeploymentError
 */
export function wrapError(
  error: unknown,
  defaultCode: ErrorCode = 'UNKNOWN_ERROR',
  context?: ErrorContext
): DeploymentError {
  if (error instanceof DeploymentError) {
    return error;
  }

  if (error instanceof Error) {
    return new DeploymentError({
      code: defaultCode,
      message: error.message,
      cause: error,
      context,
    });
  }

  return new DeploymentError({
    code: defaultCode,
    message: String(error),
    context,
  });
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: DeploymentError): boolean {
  const retryableCodes: ErrorCode[] = [
    'API_RATE_LIMIT',
    'API_TIMEOUT',
    'SSH_CONNECTION_TIMEOUT',
    'SSH_CONNECTION_REFUSED',
    'VPS_PROVISIONING_TIMEOUT',
    'DOCKER_PULL_FAILED',
    'HEALTH_CHECK_FAILED',
    'HEALTH_CHECK_TIMEOUT',
  ];

  return retryableCodes.includes(error.code);
}

/**
 * Get retry delay for an error (in milliseconds)
 */
export function getRetryDelay(error: DeploymentError): number {
  switch (error.code) {
    case 'API_RATE_LIMIT':
      return 60000; // 1 minute
    case 'SSH_CONNECTION_REFUSED':
      return 10000; // 10 seconds
    case 'VPS_PROVISIONING_TIMEOUT':
      return 30000; // 30 seconds
    default:
      return 5000; // 5 seconds default
  }
}
