# Deployment Fixes Round 2

## STATUS: 7/10 DONE, 2 PARTIAL, 1 ACCEPTABLE SKIP

### DONE

1. Dockerfile path fixed in both CI workflows
2. npm audit added to both workflows with --audit-level=high
3. .github/dependabot.yml created (npm, github-actions, docker)
4. Production docker-compose created (no dev mounts, resource limits, health checks)
5. SENTRY_DSN added to all 8 service .env.example files
6. --if-present flags removed from CI
7. Post-deployment smoke tests added (curls /health endpoints)

### PARTIAL

8. DB shutdown cleanup: 5/8 services done. user-service and system-service missing. api-gateway skipped correctly (no DB).
9. Trivy scanning: in build-test.yml only, NOT in deploy-aws.yml (production images unscanned)

### SKIPPED (acceptable)

10. CloudWatch log transport: Fargate captures stdout via awslogs driver

---

## 3 REMAINING FIXES

### Fix 1: user-service DB shutdown cleanup

File: packages/services/user-service/src/main.ts (around line 246)

The shutdown hook only calls SchedulerRegistry.stopAll() but does NOT close database connections. user-service has 69+ files using DatabaseConnectionFactory. It leaks connections on restart/deploy.

Replace the existing registerShutdownHook block with:

```typescript
registerShutdownHook(async () => {
  SchedulerRegistry.stopAll();
  const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
  await DatabaseConnectionFactory.close();
});
```

Same pattern as music-service, ai-config-service, ai-content-service, ai-analytics-service, storage-service.

### Fix 2: system-service DB shutdown cleanup

File: packages/services/system-service/src/main.ts (around line 177)

The shutdown hook only shuts down schedulers/queues but does NOT close database connections. system-service has DatabaseConnectionFactory, DatabaseServiceRepository, and its own schema.

Replace the existing registerShutdownHook block with:

```typescript
registerShutdownHook(async () => {
  logger.info('Shutting down schedulers and queues...');
  await SchedulerRegistry.shutdownAll();
  logger.info('Scheduler and queue shutdown complete');
  logger.info('Closing database connections...');
  const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
  await DatabaseConnectionFactory.close();
  logger.info('Database connections closed successfully');
});
```

### Fix 3: Add Trivy container scanning to deploy-aws.yml

File: .github/workflows/deploy-aws.yml

Trivy exists in build-test.yml but NOT in the production deploy workflow. Images are pushed to ECR without vulnerability scanning.

Add a Trivy scan step AFTER docker build/tag and BEFORE docker push. Use aquasecurity/trivy-action@0.28.0 with format table, severity HIGH,CRITICAL, and exit-code 0 (warn only, matching build-test.yml). The image-ref should match the exact tag format used in the build step using the ECR registry output and github.sha tag.

## DO NOT TOUCH

- api-gateway shutdown: verified zero DB references in its src/
- Root .env.example: docs/.env.example already exists
- Trivy exit-code: keep at 0 for consistency
- Any other files: everything else was implemented correctly
