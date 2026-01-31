/**
 * Structured logging module for serversguru-deploy
 *
 * Provides configurable logging with multiple levels, JSON output support,
 * and redaction of sensitive information.
 */

import { createWriteStream, type WriteStream } from 'fs';
import { format } from 'util';

/**
 * Log severity levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Log entry structure
 */
export interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Deployment context */
  deploymentId?: string;
  /** Current deployment step */
  step?: string;
  /** Server ID */
  serverId?: number;
  /** Server IP */
  serverIp?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Error details if applicable */
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Output format */
  format: 'pretty' | 'json';
  /** Output destination: 'console', 'file', or both */
  destination: 'console' | 'file' | 'both';
  /** File path for file logging */
  filePath?: string;
  /** Whether to include timestamps */
  timestamps: boolean;
  /** Whether to colorize output (pretty format only) */
  colors: boolean;
  /** Patterns to redact from logs (e.g., passwords, API keys) */
  redactPatterns: RegExp[];
  /** Fields to always redact */
  redactFields: string[];
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  format: 'pretty',
  destination: 'console',
  timestamps: true,
  colors: true,
  redactPatterns: [
    /password["\s:=]+[^\s&]+/gi,
    /api[_-]?key["\s:=]+[^\s&]+/gi,
    /token["\s:=]+[^\s&]+/gi,
    /secret["\s:=]+[^\s&]+/gi,
    /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ],
  redactFields: ['password', 'apiKey', 'token', 'secret', 'privateKey', 'credentials'],
};

/**
 * Log level priorities (higher = more severe)
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * ANSI color codes for pretty output
 */
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Level colors for pretty output
 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
  silent: COLORS.reset,
};

/**
 * Level labels for pretty output
 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  silent: '',
};

/**
 * Structured logger class
 */
export class Logger {
  private readonly config: LoggerConfig;
  private readonly fileStream?: WriteStream;
  private deploymentId?: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.destination === 'file' || this.config.destination === 'both') {
      if (this.config.filePath) {
        this.fileStream = createWriteStream(this.config.filePath, { flags: 'a' });
      }
    }
  }

  /**
   * Set deployment context for all subsequent logs
   */
  setDeploymentContext(deploymentId: string): void {
    this.deploymentId = deploymentId;
  }

  /**
   * Clear deployment context
   */
  clearDeploymentContext(): void {
    this.deploymentId = undefined;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.level];
  }

  /**
   * Redact sensitive information from a string
   */
  private redact(input: string): string {
    let result = input;

    // Apply redaction patterns
    for (const pattern of this.config.redactPatterns) {
      result = result.replace(pattern, '[REDACTED]');
    }

    return result;
  }

  /**
   * Redact sensitive fields from metadata
   */
  private redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (this.config.redactFields.includes(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        redacted[key] = this.redact(value);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactMetadata(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Format log entry for pretty output
   */
  private formatPretty(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    if (this.config.timestamps) {
      const timestamp = this.config.colors
        ? `${COLORS.dim}${entry.timestamp}${COLORS.reset}`
        : entry.timestamp;
      parts.push(timestamp);
    }

    // Level
    const levelStr = this.config.colors
      ? `${LEVEL_COLORS[entry.level]}${LEVEL_LABELS[entry.level]}${COLORS.reset}`
      : LEVEL_LABELS[entry.level];
    parts.push(levelStr);

    // Deployment ID
    if (entry.deploymentId) {
      const deployId = this.config.colors
        ? `${COLORS.cyan}[${entry.deploymentId}]${COLORS.reset}`
        : `[${entry.deploymentId}]`;
      parts.push(deployId);
    }

    // Step
    if (entry.step) {
      const step = this.config.colors
        ? `${COLORS.green}[${entry.step}]${COLORS.reset}`
        : `[${entry.step}]`;
      parts.push(step);
    }

    // Message
    parts.push(entry.message);

    // Metadata
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metadata = this.config.colors
        ? `${COLORS.gray}${JSON.stringify(entry.metadata)}${COLORS.reset}`
        : JSON.stringify(entry.metadata);
      parts.push(metadata);
    }

    // Error
    if (entry.error) {
      const errorStr = this.config.colors
        ? `${COLORS.red}Error: ${entry.error.message}${COLORS.reset}`
        : `Error: ${entry.error.message}`;
      parts.push(errorStr);
    }

    return parts.join(' ');
  }

  /**
   * Format log entry for JSON output
   */
  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Write log entry to outputs
   */
  private write(entry: LogEntry): void {
    const formatted =
      this.config.format === 'json' ? this.formatJson(entry) : this.formatPretty(entry);

    // Console output
    if (this.config.destination === 'console' || this.config.destination === 'both') {
      const consoleMethod =
        entry.level === 'error'
          ? console.error
          : entry.level === 'warn'
            ? console.warn
            : console.log;
      consoleMethod(formatted);
    }

    // File output
    if (this.fileStream) {
      this.fileStream.write(`${formatted}\n`);
    }
  }

  /**
   * Create a log entry
   */
  private log(
    level: LogLevel,
    message: string,
    context?: {
      step?: string;
      serverId?: number;
      serverIp?: string;
      metadata?: Record<string, unknown>;
      error?: Error;
    }
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: this.redact(message),
      deploymentId: this.deploymentId,
      step: context?.step,
      serverId: context?.serverId,
      serverIp: context?.serverIp ? this.redact(context.serverIp) : undefined,
      metadata: context?.metadata ? this.redactMetadata(context.metadata) : undefined,
    };

    if (context?.error) {
      entry.error = {
        message: this.redact(context.error.message),
        stack: context.error.stack,
      };
    }

    this.write(entry);
  }

  /**
   * Log debug message
   */
  debug(
    message: string,
    context?: {
      step?: string;
      serverId?: number;
      serverIp?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log('debug', message, context);
  }

  /**
   * Log info message
   */
  info(
    message: string,
    context?: {
      step?: string;
      serverId?: number;
      serverIp?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    this.log('info', message, context);
  }

  /**
   * Log warning message
   */
  warn(
    message: string,
    context?: {
      step?: string;
      serverId?: number;
      serverIp?: string;
      metadata?: Record<string, unknown>;
      error?: Error;
    }
  ): void {
    this.log('warn', message, context);
  }

  /**
   * Log error message
   */
  error(
    message: string,
    context?: {
      step?: string;
      serverId?: number;
      serverIp?: string;
      metadata?: Record<string, unknown>;
      error?: Error;
    }
  ): void {
    this.log('error', message, context);
  }

  /**
   * Log deployment step progress
   */
  step(stepName: string, message: string, metadata?: Record<string, unknown>): void {
    this.info(message, { step: stepName, metadata });
  }

  /**
   * Create a child logger with additional context
   */
  child(context: {
    step?: string;
    serverId?: number;
    serverIp?: string;
  }): Logger {
    const childLogger = new Logger(this.config);
    childLogger.deploymentId = this.deploymentId;

    // Create bound methods with context
    const originalLog = this.log.bind(this);
    childLogger.log = (level: LogLevel, message: string, ctx?: typeof context) => {
      originalLog(level, message, {
        ...context,
        ...ctx,
      });
    };

    return childLogger;
  }

  /**
   * Close file stream if open
   */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | undefined;

/**
 * Get or create the global logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

/**
 * Set the global logger instance
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Create a CI-friendly logger (JSON format, no colors)
 */
export function createCILogger(level: LogLevel = 'info'): Logger {
  return new Logger({
    level,
    format: 'json',
    destination: 'console',
    timestamps: true,
    colors: false,
  });
}

/**
 * Create a development logger (pretty format with colors)
 */
export function createDevLogger(level: LogLevel = 'debug'): Logger {
  return new Logger({
    level,
    format: 'pretty',
    destination: 'console',
    timestamps: true,
    colors: true,
  });
}

/**
 * Parse log level from environment variable
 */
export function parseLogLevel(level?: string): LogLevel {
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];
  const normalized = level?.toLowerCase() as LogLevel;
  return validLevels.includes(normalized) ? normalized : 'info';
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true' ||
    process.env.TRAVIS === 'true' ||
    process.env.CIRCLECI === 'true' ||
    process.env.JENKINS === 'true' ||
    false
  );
}

/**
 * Create appropriate logger for current environment
 */
export function createEnvironmentLogger(): Logger {
  if (isCI()) {
    return createCILogger(parseLogLevel(process.env.LOG_LEVEL));
  }
  return createDevLogger(parseLogLevel(process.env.LOG_LEVEL));
}
