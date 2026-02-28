# Deployment Fixes — Continuation Prompt for Coding Agent

## Context

A deployability audit was performed on this Aiponge monorepo (Node.js/TypeScript microservices platform). Several issues were found. Some have been addressed, some partially, and some not at all. Below is the status of each recommendation and what still needs to be done.

---

## STATUS OF PREVIOUS RECOMMENDATIONS

### FIXED (no action needed)

- `.env` is in `.gitignore` and was never committed to git history
- No hardcoded secrets in source code — all secrets loaded via `process.env`
- Kubernetes-compatible health probes implemented (`/health/live`, `/health/ready`, `/health/startup`)
- Structured health check response format with timestamps, components, uptime
- External API connectivity verified in health checks
- Graceful shutdown timeout increased to 30s (configurable via `SHUTDOWN_TIMEOUT_MS`)
- Request drain period implemented (`server.close()` waits for in-flight requests)
- SIGTERM/SIGINT handling with `isShuttingDown` guard
- Cluster-mode graceful shutdown in API Gateway
- CORS properly restrictive (blocks wildcard in production, returns 403 for unauthorized origins)
- Docker images tagged with git SHA in CI/CD
- Sentry implementation code exists and is functional
- Key rotation strategy documented

### VALID DESIGN DECISIONS (no action needed)

- Secrets management relies on ECS task definition injecting secrets from AWS Secrets Manager into container env vars at runtime — this is a valid AWS pattern that doesn't require SDK code in the application
- Drizzle uses `push` mode for schema sync rather than SQL migration files — acceptable for this project stage

---

## REMAINING FIXES NEEDED (in priority order)

### 1. CRITICAL: Fix Dockerfile path in CI/CD workflows

**Files:** `.github/workflows/deploy-aws.yml` (line 91), `.github/workflows/build-test.yml` (line 100)
**Issue:** Both reference `infrastructure/docker/Dockerfile.service` but the actual path is `deploy/docker/Dockerfile.service`. The `infrastructure/` directory doesn't exist. This means **all Docker builds in CI will fail**.
**Fix:** Change `file: infrastructure/docker/Dockerfile.service` to `file: deploy/docker/Dockerfile.service` in both workflow files.

### 2. HIGH: Add `npm audit` to CI/CD pipeline

**Files:** `.github/workflows/build-test.yml`
**Issue:** No dependency vulnerability scanning runs in CI. There's evidence of manual audits (docs/SECURITY_UPGRADE_REPORT.md) but nothing automated.
**Fix:** Add a step after `npm ci` that runs `npm audit --audit-level=high` (or `--audit-level=critical` to start). This should fail the build if high/critical vulnerabilities are found.

### 3. HIGH: Add Dependabot configuration

**File to create:** `.github/dependabot.yml`
**Issue:** No automated dependency update PRs. No Snyk or Dependabot configured.
**Fix:** Create `.github/dependabot.yml` with configuration for npm ecosystem, targeting the root `package.json` and key service directories. Use weekly schedule.

### 4. HIGH: Create production docker-compose file

**File to create:** `deploy/docker/docker-compose.prod.yml`
**Issue:** The existing `docker-compose.yml` has dev volume mounts on every service (e.g., `../../packages/services/system-service:/app/src`) which are dangerous in production. There is no production-specific compose file.
**Fix:** Create `deploy/docker/docker-compose.prod.yml` that:

- Removes all dev volume mounts
- Uses built images (not source mounts)
- Sets `NODE_ENV=production`
- Sets appropriate resource limits (memory, CPU)
- Uses `restart: unless-stopped`
- Keeps health checks and networking from the dev compose

### 5. HIGH: Register database connection cleanup in shutdown hooks

**Files:** Each service's `main.ts` or entry point
**Issue:** `DatabaseConnectionFactory` has a `close()` method but it is NOT called during graceful shutdown. Only scheduler/queue cleanup is registered.
**Fix:** In each service's startup code, after calling `setupGracefulShutdown(server)`, register a shutdown hook that closes the database connection:

```typescript
registerShutdownHook(async () => {
  await databaseConnection.close();
});
```

### 6. MEDIUM: Add SENTRY_DSN to all .env.example files

**Files:** Each service's `.env.example`, root `.env.example`, `packages/platform-core/.env.example`
**Issue:** `SENTRY_DSN` exists in `docs/.env.production.example` but is missing from individual service `.env.example` files. Developers won't know to configure it.
**Fix:** Add `SENTRY_DSN=` (empty placeholder) to each service's `.env.example` file with a comment explaining it's required for production error tracking.

### 7. MEDIUM: Remove `--if-present` flags from CI scripts

**Files:** `.github/workflows/build-test.yml` (lines 28, 74), `.github/workflows/deploy-aws.yml` (lines 41, 44)
**Issue:** `npm run lint --if-present` and `npm test --if-present` silently succeed if the script doesn't exist, masking real failures.
**Fix:** Replace `--if-present` with direct script calls. If a service genuinely doesn't have lint/test scripts, either add them or skip that service explicitly in the matrix.

### 8. MEDIUM: Add post-deployment smoke tests

**File:** `.github/workflows/deploy-aws.yml`
**Issue:** After deployment, the workflow only runs `aws ecs wait services-stable` for the API gateway. No actual HTTP smoke tests verify the deployment works.
**Fix:** After the ECS stabilization wait, add a step that:

- Curls the API gateway's `/health` endpoint
- Curls `/health/ready` to verify all dependencies are connected
- Fails the workflow if health checks return non-200

### 9. LOW: Add container image scanning

**File:** `.github/workflows/build-test.yml` or `.github/workflows/deploy-aws.yml`
**Issue:** No Trivy/Clair/Scout scanning for vulnerabilities in built Docker images.
**Fix:** Add an `aquasecurity/trivy-action` step after the Docker build step in the deploy workflow. Scan for HIGH and CRITICAL vulnerabilities. Start with `exit-code: 0` (warn only) and tighten to `exit-code: 1` (fail) once clean.

### 10. LOW: Add CloudWatch Logs transport to Winston

**File:** `packages/platform-core/src/logging/logger.ts`
**Issue:** Winston logs go to console and local files only. In ECS/Fargate, stdout is captured by CloudWatch automatically via the awslogs driver (which IS configured in the ECS task definitions). So this is partially handled by infrastructure.
**Fix:** Verify that the ECS task definitions use the `awslogs` log driver (they do in the templates). Optionally add `winston-cloudwatch` transport for more structured log groups, but this is not strictly necessary since Fargate captures stdout automatically. **This may be skipped if the team is satisfied with Fargate's default log capture.**

---

## WHAT NOT TO DO

- Do NOT add AWS Secrets Manager SDK code — the ECS task definition injection pattern is valid
- Do NOT create Terraform/CDK/CloudFormation — IaC is a separate infrastructure project, not a code fix
- Do NOT rewrite the migration system — Drizzle push mode is intentional
- Do NOT add OpenTelemetry/Jaeger/distributed tracing — this is a significant architectural addition, not a quick fix
- Do NOT increase test coverage — that's ongoing work, not a deployment blocker

---

## EXECUTION ORDER

1. Fix Dockerfile path in workflows (2 min fix, unblocks all CI)
2. Remove `--if-present` flags (5 min)
3. Add `npm audit` step to CI (5 min)
4. Create `.github/dependabot.yml` (5 min)
5. Create `docker-compose.prod.yml` (15 min)
6. Register DB connection cleanup in shutdown hooks across services (15 min)
7. Add SENTRY_DSN to .env.example files (5 min)
8. Add post-deployment smoke tests (10 min)
9. Add Trivy container scanning (10 min)
10. (Optional) Verify CloudWatch log capture via awslogs driver
