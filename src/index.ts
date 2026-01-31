/**
 * serversguru-deploy - Autonomous VPS deployment using Servers.guru API
 *
 * @packageDocumentation
 */

// Main library exports
export { DeploymentOrchestrator } from './orchestrator.js';
export { ServersGuruClient, ServersGuruApiError } from './api/servers-guru.js';
export { SshProvisioner } from './ssh/provisioner.js';

// Configuration exports
export * from './config.js';

// Template exports
export * from './templates/index.js';

// Error handling exports
export {
  DeploymentError,
  ConfigError,
  ApiError,
  SshError,
  ValidationError,
  AggregateDeploymentError,
  wrapError,
  isRetryableError,
  getRetryDelay,
  type ErrorCode,
  type ErrorContext,
  type ErrorSeverity,
  type DeploymentErrorOptions,
} from './errors.js';

// Logging exports
export {
  Logger,
  getLogger,
  setLogger,
  createCILogger,
  createDevLogger,
  createEnvironmentLogger,
  parseLogLevel,
  isCI,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
} from './logger.js';

// Pre-flight check exports
export {
  runPreflightChecks,
  ALL_PREFLIGHT_CHECKS,
  formatPreflightResults,
  type PreflightResult,
  type PreflightCheck,
  type PreflightContext,
  type PreflightCheckResults,
} from './preflight.js';

// Version
export const VERSION = '1.0.1';
