# serversguru-deploy Improvement Plan

## Executive Summary

This document outlines a comprehensive plan to improve the `serversguru-deploy` npm package for public use, focusing on code robustness, test coverage, developer experience, and production readiness.

---

## Part 1: Public Readiness Improvements

### 1.1 Documentation Enhancements

#### API Documentation
- **Current State**: Basic README with usage examples
- **Improvements Needed**:
  - Generate TypeDoc API documentation for all public classes and methods
  - Add JSDoc examples to all public methods
  - Create separate documentation site (GitHub Pages or similar)
  - Add troubleshooting guide with common errors and solutions
  - Document rate limits and API constraints

#### Configuration Documentation
- Create JSON Schema for `deploy.yaml` for IDE autocomplete
- Document all environment variables with security best practices
- Add configuration validation error messages guide

### 1.2 Error Handling & User Experience

#### Enhanced Error Messages
```typescript
// Current: Generic error messages
throw new Error('SSH connection timeout');

// Improved: Actionable error messages with context
throw new DeploymentError({
  code: 'SSH_CONNECTION_TIMEOUT',
  message: 'Unable to connect to server 123.45.67.89:22 after 120000ms',
  suggestion: 'Check firewall rules, verify server is running, or increase timeout in config',
  docsUrl: 'https://github.com/0xjacq/serversguru-deploy/blob/main/docs/errors/SSH_CONNECTION_TIMEOUT.md'
});
```

#### Error Categories to Implement
| Error Code | Description | Recovery Action |
|------------|-------------|-----------------|
| `API_KEY_INVALID` | Authentication failed | Check API key format |
| `INSUFFICIENT_BALANCE` | Account balance too low | Add funds to account |
| `VPS_PROVISIONING_FAILED` | VPS failed to provision | Contact support with server ID |
| `SSH_CONNECTION_TIMEOUT` | Cannot connect via SSH | Check network/firewall |
| `DOCKER_PULL_FAILED` | Cannot pull image | Check registry credentials |
| `HEALTH_CHECK_FAILED` | App not responding | Check app logs |
| `SSL_CERTIFICATE_FAILED` | Certbot failed | Check DNS, rate limits |

### 1.3 Logging & Observability

#### Structured Logging
- Replace console.log with structured logging (pino or winston)
- Add log levels (debug, info, warn, error)
- Support JSON output for CI/CD integration
- Add request/response logging for API calls (with sensitive data redaction)

```typescript
// Example structured log entry
{
  "level": "info",
  "timestamp": "2026-01-30T07:51:17.586Z",
  "deploymentId": "deploy-abc123",
  "step": "deploy-application",
  "serverId": 12345,
  "message": "Docker image pulled successfully",
  "image": "ghcr.io/user/app:v1.2.3",
  "duration": 45000
}
```

#### Progress Events
- Emit events for each deployment step
- Allow external progress tracking
- Support cancellation tokens

### 1.4 Security Hardening

#### Secrets Management
- Add support for external secret providers (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)
- Implement secret masking in logs
- Add `.env` file support with `dotenv`
- Warn when secrets are passed via command line

#### SSH Security
- Support SSH key-based authentication (already partially implemented)
- Add SSH host key verification
- Support SSH agent forwarding
- Add connection encryption verification

#### API Security
- Add request signing for API calls
- Implement automatic retry with exponential backoff
- Add circuit breaker pattern for API failures

### 1.5 Configuration Validation

#### Pre-flight Checks
```typescript
// Add validation methods
interface PreflightCheck {
  name: string;
  check: () => Promise<CheckResult>;
  required: boolean;
}

const preflightChecks: PreflightCheck[] = [
  { name: 'API connectivity', check: checkApiConnectivity, required: true },
  { name: 'Docker registry access', check: checkRegistryAccess, required: false },
  { name: 'DNS resolution', check: checkDnsResolution, required: false },
  { name: 'Sufficient balance', check: checkBalance, required: true },
];
```

### 1.6 CLI Improvements

#### Interactive Mode
- Add `sg-deploy init --interactive` for guided configuration
- Add confirmation prompts for destructive operations
- Add progress bars for long-running operations

#### Output Formats
- Support `--format json` for programmatic consumption
- Support `--format table` for human-readable output (default)
- Add `--quiet` mode for CI/CD

#### Shell Completions
- Add bash/zsh/fish completions
- Add `--completion` flag to generate completions

---

## Part 2: Testing & Coverage Strategy

### 2.1 Test Architecture

```
tests/
├── unit/                          # Fast, isolated tests
│   ├── api-client.test.ts
│   ├── config.test.ts
│   ├── templates.test.ts
│   ├── ssh-provisioner.test.ts
│   └── orchestrator.test.ts       # Mocked dependencies
├── integration/                   # API integration tests
│   ├── api-integration.test.ts    # Real API calls (optional)
│   └── ssh-mock.test.ts           # SSH with mock server
├── e2e/                          # End-to-end tests
│   └── deployment.test.ts         # Full deployment flow
├── fixtures/                      # Test data
│   ├── configs/
│   ├── responses/
│   └── keys/
└── helpers/                       # Test utilities
    ├── mock-ssh-server.ts
    ├── mock-api-server.ts
    └── test-utils.ts
```

### 2.2 Unit Test Coverage Goals

| Module | Current | Target | Priority |
|--------|---------|--------|----------|
| `config.ts` | Partial | 100% | High |
| `api/servers-guru.ts` | Partial | 95% | High |
| `ssh/provisioner.ts` | None | 90% | High |
| `orchestrator.ts` | None | 85% | High |
| `templates/index.ts` | Partial | 95% | Medium |
| `cli.ts` | None | 70% | Medium |

### 2.3 Unit Test Implementation Plan

#### Phase 1: Core Modules (Week 1)
- [ ] Expand `config.test.ts` to 100% coverage
  - Test all schema validation paths
  - Test default value application
  - Test error message formatting
  
- [ ] Complete `api-client.test.ts`
  - Test all API methods
  - Test error handling paths
  - Test retry logic
  - Mock all fetch calls

#### Phase 2: SSH & Templates (Week 2)
- [ ] Create `ssh-provisioner.test.ts`
  - Mock `ssh2` and `ssh2-sftp-client`
  - Test connection logic
  - Test command execution
  - Test file upload/download
  - Test error scenarios

- [ ] Expand `templates.test.ts`
  - Test all template constants
  - Test edge cases in variable substitution

#### Phase 3: Orchestrator (Week 3)
- [ ] Create `orchestrator.test.ts`
  - Mock all dependencies (API client, SSH)
  - Test each deployment step independently
  - Test error recovery
  - Test rollback scenarios

#### Phase 4: CLI (Week 4)
- [ ] Create `cli.test.ts`
  - Test command parsing
  - Test configuration loading
  - Test error output formatting

### 2.4 Integration Tests

#### Mock API Server
```typescript
// tests/helpers/mock-api-server.ts
export class MockServersGuruApi {
  // Simulates API responses
  // Supports error injection
  // Records request history
}
```

#### Mock SSH Server
```typescript
// tests/helpers/mock-ssh-server.ts
export class MockSshServer {
  // Simulates SSH connections
  // Records executed commands
  // Simulates file system
  // Supports latency simulation
}
```

### 2.5 E2E Tests

#### Test Scenarios
1. **Happy Path**: Full deployment with all features
2. **Existing Server**: Deploy to existing VPS
3. **IP Only**: Deploy without domain/SSL
4. **Rollback**: Deploy, break, rollback
5. **Health Check Failure**: Deploy with failing health check
6. **Insufficient Balance**: Deploy with no funds

### 2.6 Test Utilities

```typescript
// tests/helpers/test-utils.ts
export function createMockConfig(overrides?: Partial<DeploymentConfig>): DeploymentConfig;
export function mockFetch(response: unknown): void;
export function waitForCondition(condition: () => boolean, timeout?: number): Promise<void>;
export function captureLogs(fn: () => Promise<void>): string[];
```

### 2.7 Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'], // CLI tested separately
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
```

---

## Part 3: Code Quality Improvements

### 3.1 Linting & Formatting

#### Current State
- ESLint configured but minimal rules
- No Prettier configuration

#### Improvements
- [ ] Add comprehensive ESLint rules (@typescript-eslint/recommended)
- [ ] Add Prettier configuration
- [ ] Add import sorting (eslint-plugin-import)
- [ ] Add complexity rules (max-lines-per-function, max-params)
- [ ] Add pre-commit hooks (husky + lint-staged)

### 3.2 Type Safety

#### Strict TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

#### Branded Types for IDs
```typescript
// Prevent mixing up different ID types
type ServerId = number & { __brand: 'ServerId' };
type SnapshotId = number & { __brand: 'SnapshotId' };

function createServerId(id: number): ServerId {
  return id as ServerId;
}
```

### 3.3 Code Organization

#### Refactoring Suggestions

1. **Split `orchestrator.ts`** (currently ~540 lines)
   - `DeploymentOrchestrator` - Main orchestration
   - `DeploymentSteps` - Individual step implementations
   - `DeploymentState` - State management

2. **Split `cli.ts`** (currently ~450 lines)
   - `commands/deploy.ts`
   - `commands/status.ts`
   - `commands/list.ts`
   - etc.

3. **Add utilities module**
   - `utils/retry.ts` - Retry logic
   - `utils/validation.ts` - Input validation
   - `utils/logging.ts` - Logging utilities

### 3.4 Performance Optimizations

#### Connection Pooling
- Reuse SSH connections across operations
- Add connection health checks

#### Parallel Operations
```typescript
// Run independent operations in parallel
await Promise.all([
  this.setupFirewall(),
  this.installDocker(),
  this.configureNginx(),
]);
```

#### Caching
- Cache API responses (products, images)
- Add TTL for cached data

---

## Part 4: Additional Recommendations

### 4.1 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:coverage
      - run: npm run build
```

### 4.2 Release Automation

- Use `semantic-release` for automated versioning
- Generate changelog automatically
- Create GitHub releases with notes
- Publish to npm on tag push

### 4.3 Monitoring & Analytics

#### Optional Telemetry (opt-in)
- Track deployment success/failure rates
- Track deployment duration
- Track most-used features
- No sensitive data collection

### 4.4 Community Features

- Add GitHub issue templates
- Add contributing guidelines
- Add code of conduct
- Setup Discord/Slack community

---

## Part 5: Implementation Priority

### Immediate (High Impact, Low Effort)
1. Expand unit test coverage for existing tests
2. Add pre-commit hooks for linting
3. Improve error messages with suggestions
4. Add JSON output format for CLI

### Short-term (High Impact, Medium Effort)
1. Complete unit test coverage for all modules
2. Add integration tests with mocks
3. Implement structured logging
4. Add pre-flight validation checks
5. Create comprehensive API documentation

### Medium-term (Medium Impact, Medium Effort)
1. Add E2E tests
2. Implement telemetry (opt-in)
3. Add secret provider integrations
4. Create troubleshooting documentation
5. Add shell completions

### Long-term (High Impact, High Effort)
1. Refactor large files into smaller modules
2. Add support for multiple VPS providers
3. Create web dashboard for deployments
4. Add deployment history tracking

---

## Appendix: Testing Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx vitest run tests/unit/api-client.test.ts

# Run in watch mode
npm run test:watch

# Run with UI
npx vitest --ui
```

## Questions for Discussion

1. **API Testing**: Should we include integration tests against the real Servers.guru API, or rely entirely on mocks?

2. **Node.js Versions**: What minimum Node.js version should we support? Currently set to 18.x.

3. **Telemetry**: Are you open to adding opt-in telemetry to understand feature usage?

4. **Documentation Hosting**: Would you prefer GitHub Pages, a custom domain, or keep documentation in-repo?

5. **Breaking Changes**: Are you willing to make breaking changes for v2.0, or should we maintain backward compatibility?
