# CI/CD Integration Example

This example demonstrates integrating `sg-deploy` with GitHub Actions for automated deployments.

## Overview

The workflow:

1. On push to `main` → Deploy to **production**
2. On push to `staging` → Deploy to **staging**
3. On pull request → Run **dry-run** validation

## Files

- `.github/workflows/deploy.yml` - GitHub Actions workflow
- `deploy.yaml` - Base deployment configuration
- `deploy.staging.yaml` - Staging overrides
- `deploy.production.yaml` - Production overrides

## Setup

### 1. Repository Secrets

Add these secrets in GitHub (Settings → Secrets → Actions):

| Secret                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `SERVERSGURU_API_KEY`        | Your Servers.guru API key                  |
| `DOCKER_REGISTRY_USERNAME`   | Container registry username                |
| `DOCKER_REGISTRY_PASSWORD`   | Container registry password/token          |
| `STAGING_SERVER_IP`          | Staging server IP (for existing server)    |
| `STAGING_SERVER_PASSWORD`    | Staging server password                    |
| `PRODUCTION_SERVER_IP`       | Production server IP (for existing server) |
| `PRODUCTION_SERVER_PASSWORD` | Production server password                 |

### 2. Environment Setup

Create environments in GitHub (Settings → Environments):

- **staging** - No protection rules
- **production** - Add required reviewers for manual approval

### 3. Container Registry

The workflow uses GitHub Container Registry (ghcr.io). Ensure your repository has:

- Package write permissions enabled
- GITHUB_TOKEN has package access

## Workflow Details

### Stages

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Build     │ →  │    Test     │ →  │  Deploy (Staging/   │ │
│  │   Image     │    │   Suite     │    │  Production)        │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Triggers

| Trigger           | Action                         |
| ----------------- | ------------------------------ |
| Push to `main`    | Deploy to production           |
| Push to `staging` | Deploy to staging              |
| Pull request      | Validate config (dry-run)      |
| Manual dispatch   | Deploy to selected environment |

### Job: Build

1. Checkout code
2. Build Docker image
3. Push to GitHub Container Registry

### Job: Deploy

1. Install `sg-deploy`
2. Run pre-flight checks
3. Deploy to target environment
4. Output deployment URL

## Configuration Strategy

### Base Configuration

`deploy.yaml` contains shared settings:

- VPS type preferences
- SSH configuration
- Health check settings
- Snapshot options

### Environment Overrides

`deploy.staging.yaml` and `deploy.production.yaml` contain environment-specific:

- Server targeting (for existing servers)
- Domain names
- Environment variables
- Resource sizing

## Usage

### Automated Deployment

Push to trigger deployment:

```bash
# Deploy to staging
git checkout staging
git merge feature-branch
git push

# Deploy to production
git checkout main
git merge staging
git push
```

### Manual Deployment

Use GitHub Actions UI:

1. Go to Actions → Deploy
2. Click "Run workflow"
3. Select environment
4. Click "Run workflow"

### Local Validation

Test configuration locally before pushing:

```bash
# Install CLI
npm install -g serversguru-deploy

# Validate staging config
sg-deploy deploy -c deploy.staging.yaml --dry-run

# Validate production config
sg-deploy deploy -c deploy.production.yaml --dry-run
```

## Environment Variables

### Required

| Variable                   | Description              |
| -------------------------- | ------------------------ |
| `SERVERSGURU_API_KEY`      | API key for Servers.guru |
| `DOCKER_REGISTRY_USERNAME` | Registry username        |
| `DOCKER_REGISTRY_PASSWORD` | Registry password        |

### Per-Environment

**Staging:**

- `STAGING_DOMAIN` - Staging domain name
- `DATABASE_URL` - Staging database

**Production:**

- `PRODUCTION_DOMAIN` - Production domain name
- `DATABASE_URL` - Production database

## Advanced Patterns

### Rollback on Failure

The workflow can rollback on deployment failure:

```yaml
- name: Rollback on failure
  if: failure()
  run: |
    sg-deploy rollback \
      --server-id ${{ steps.deploy.outputs.server-id }} \
      --snapshot-id ${{ steps.deploy.outputs.previous-snapshot }}
```

### Slack Notifications

Add Slack notifications:

```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    fields: repo,message,commit,author
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Deployment Gates

Add manual approval for production:

```yaml
environment:
  name: production
  url: https://app.example.com
```

## Troubleshooting

### Build fails

1. Check Docker context is correct
2. Verify Dockerfile path
3. Check registry permissions

### Deployment timeout

1. Increase `setupTimeout` in config
2. Check VPS provisioning status
3. Review server logs

### Health check fails

1. Verify health endpoint returns 200
2. Check application logs
3. Ensure correct port configuration

### Permission denied

1. Verify GitHub secrets are set
2. Check environment has access to secrets
3. Ensure token has correct scopes
