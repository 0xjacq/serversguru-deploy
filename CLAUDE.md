# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode compilation
npm run test           # Run all tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix lint issues
npm run format         # Format with Prettier
npm run type-check     # TypeScript type checking without emit
```

Run a single test file:

```bash
npx vitest run tests/unit/orchestrator.test.ts
```

Run tests matching a pattern:

```bash
npx vitest run -t "deployment pipeline"
```

## Architecture Overview

This is a CLI tool and library for automated VPS deployment using the Servers.guru API. The deployment pipeline: **Order VPS → Wait for provisioning → SSH setup → Deploy Docker app → Configure Nginx → SSL certificate → Health check → Snapshot**.

### Core Components

```
src/
├── cli.ts              # Commander-based CLI entry point (sg-deploy command)
├── orchestrator.ts     # DeploymentOrchestrator - coordinates the 10-step deployment pipeline
├── config.ts           # Zod schemas for configuration validation, type definitions
├── api/
│   └── servers-guru.ts # ServersGuruClient - HTTP client for Servers.guru API
├── ssh/
│   └── provisioner.ts  # SshProvisioner - SSH connections, command execution, SFTP
├── templates/
│   └── index.ts        # Shell scripts and config templates (setup, docker-compose, nginx)
├── preflight.ts        # Pre-flight validation checks before deployment
├── errors.ts           # Structured error types with codes, suggestions, retry logic
└── logger.ts           # Structured logging with CI/dev modes
```

### Data Flow

1. **CLI** (`cli.ts`) parses args, loads YAML config, applies env var overrides
2. **Config validation** uses Zod schemas (`config.ts`) to validate and type the config
3. **Preflight checks** (`preflight.ts`) validate API connectivity, balance, VPS availability
4. **Orchestrator** (`orchestrator.ts`) runs the deployment steps sequentially
5. **API Client** (`api/servers-guru.ts`) handles VPS ordering, status polling, snapshots
6. **SSH Provisioner** (`ssh/provisioner.ts`) runs remote commands and file transfers

### Key Patterns

- **Configuration**: All config flows through Zod schemas with env var interpolation (`${VAR_NAME}` syntax)
- **Error handling**: Custom error classes (`DeploymentError`, `ApiError`, `SshError`) with error codes, suggestions, and retry logic
- **Templates**: Server setup scripts and configs use `${VAR}` or `{{VAR}}` syntax, rendered via `renderTemplate()`
- **Progress tracking**: Orchestrator uses `ProgressCallback` to report step progress

### Test Structure

```
tests/
├── unit/               # Unit tests with mocked dependencies
│   ├── api-client.test.ts
│   ├── config.test.ts
│   ├── orchestrator.test.ts
│   ├── ssh-provisioner.test.ts
│   └── templates.test.ts
└── integration/        # Integration tests with mock API server
    ├── api-integration.test.ts
    └── mock-api-server.ts
```

### Unit Test Mocking Pattern

Unit tests use shared mock references at module level for testability:

```typescript
// Define shared mock functions at module level
const mockConnect = vi.fn();
const mockExec = vi.fn();

// Use in vi.mock() factory
vi.mock('some-module', () => ({
  SomeClass: class {
    connect = mockConnect;
    exec = mockExec;
  },
}));

// Set default behaviors in beforeEach
beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(undefined);
  mockExec.mockResolvedValue({ code: 0 });
});

// Override per-test as needed
it('should handle errors', async () => {
  mockExec.mockRejectedValueOnce(new Error('failed'));
  // ...
});
```

This pattern allows tests to verify mock calls and override behavior per-test.

## Key Types

- `DeploymentConfig` - Full deployment configuration (VPS, app, SSH, domain, options)
- `DeploymentResult` - Deployment outcome (success, serverId, serverIp, errors, logs)
- `DeploymentStep` - Pipeline step names for progress tracking
- `ErrorCode` - Machine-readable error codes for structured error handling

## Module Exports

The library exports from `src/index.ts`:

- `DeploymentOrchestrator` - Main deployment class
- `ServersGuruClient` - Low-level API client
- `SshProvisioner` - SSH/SFTP operations
- `runPreflightChecks` - Pre-deployment validation
- Error utilities: `DeploymentError`, `isRetryableError`, `wrapError`

## Sub-path Exports

The package provides additional sub-path exports for selective imports:

```typescript
import { DeploymentError } from 'serversguru-deploy/errors';
import { Logger } from 'serversguru-deploy/logger';
import { runPreflightChecks } from 'serversguru-deploy/preflight';
```

## ES Modules

This is an ES module project (`"type": "module"`). Use `.js` extensions in imports even for TypeScript files (e.g., `import { X } from './module.js'`). Requires Node.js >= 18.
