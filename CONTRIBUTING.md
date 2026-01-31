# Contributing to serversguru-deploy

Thank you for your interest in contributing to serversguru-deploy! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code:

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/serversguru-deploy.git
   cd serversguru-deploy
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix ESLint issues
npm run lint:fix

# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Type Checking

```bash
npm run type-check
```

### Building

```bash
npm run build
```

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Build process or auxiliary tool changes

Examples:
```
feat: add support for custom SSH ports
fix: resolve SSH timeout issue on slow connections
docs: update API documentation for DeploymentOrchestrator
test: add unit tests for SshProvisioner
```

## Pull Request Process

1. **Before submitting:**
   - Ensure all tests pass
   - Run linting and type checking
   - Update documentation if needed
   - Add tests for new features

2. **Submit PR:**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changes were made and why
   - Include screenshots for UI changes

3. **Review process:**
   - Maintainers will review your PR
   - Address any requested changes
   - Once approved, your PR will be merged

## Coding Standards

### TypeScript

- Use strict TypeScript mode
- Explicitly type function return values
- Avoid `any` types when possible
- Use interfaces for object shapes

### Code Style

- Use single quotes for strings
- Use trailing commas
- Max line length: 100 characters
- 2 spaces for indentation

### File Organization

```
src/
├── index.ts          # Main exports
├── cli.ts            # CLI entry point
├── config.ts         # Configuration types and validation
├── errors.ts         # Error classes
├── logger.ts         # Logging utilities
├── preflight.ts      # Pre-flight checks
├── api/              # API clients
├── ssh/              # SSH utilities
└── templates/        # Deployment templates
```

## Testing

### Test Structure

```
tests/
├── unit/             # Unit tests
├── integration/      # Integration tests
└── helpers/          # Test utilities
```

### Writing Tests

- Use descriptive test names
- Group related tests with `describe`
- Use `beforeEach` for setup
- Mock external dependencies

Example:
```typescript
describe('DeploymentOrchestrator', () => {
  describe('deploy', () => {
    it('should complete deployment successfully', async () => {
      // Arrange
      const orchestrator = new DeploymentOrchestrator(config);
      
      // Act
      const result = await orchestrator.deploy();
      
      // Assert
      expect(result.success).toBe(true);
    });
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Update docs/API.md for API changes
- Use JSDoc comments for public methods
- Include code examples where helpful

### JSDoc Example

```typescript
/**
 * Deploy application to a new VPS
 * @param config - Deployment configuration
 * @returns Deployment result with server details
 * @throws {DeploymentError} When deployment fails
 * @example
 * ```typescript
 * const result = await deploy({
 *   serversGuru: { apiKey: 'key' },
 *   vps: { type: 'NL1-2', osImage: 'ubuntu-22.04' },
 *   app: { name: 'my-app', dockerImage: 'nginx:latest', port: 80 }
 * });
 * ```
 */
```

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

Thank you for contributing!
