# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@serversguru-deploy.dev**

Please include:
- Description of the vulnerability
- Steps to reproduce (if applicable)
- Possible impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Depends on severity
  - Critical: 7 days
  - High: 30 days
  - Medium: 90 days
  - Low: Next release

### Security Best Practices

When using this package:

1. **API Keys**: Store API keys in environment variables, never in code
2. **SSH Keys**: Use SSH key authentication instead of passwords when possible
3. **Docker Images**: Use private registries with authentication for sensitive images
4. **Domain Configuration**: Ensure DNS is properly configured before requesting SSL
5. **Secrets Rotation**: Regularly rotate API keys and registry credentials

## Security Features

This package includes:

- Automatic redaction of sensitive data in logs
- Support for SSH key-based authentication
- Environment variable support for secrets
- No storage of credentials in code

## Acknowledgments

We thank the following individuals for responsible vulnerability disclosures:

- *None yet - be the first!*
