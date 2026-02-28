# Quick Wins — Remediation V2 (2 Issues)

> **Context**: The quick-win tasks are complete, but the agent made unsolicited changes to CI workflow files. One change introduced a problem; the other is fine. The `deploy.yml` also still wasn't deleted.
>
> **What's done and correct (DO NOT touch)**:
>
> - Task 1 ✅ `alarm_sns_email = "ops@aiponge.com"` in both tfvars
> - Task 2 ✅ Root vitest coverage thresholds (50/40/45/50)
> - Task 3 ✅ 3 new CloudWatch alarms in monitoring.tf (7 total)
> - Task 4 ✅ `sys_audit_log` table in system-schema.ts
> - `ci.yml` JWT_SECRET additions to `test` and `feature-flag-matrix` jobs ✅ (valid fix)
> - `backend-deploy.yml` improvements ✅ (matrix include format, build→scan→push split, Trivy pinning, enhanced smoke tests — all good)

---

## FIX 1: Delete deploy.yml from disk

**Problem**: The task asked to **delete** `.github/workflows/deploy.yml`. The agent first gutted it to a comment, then changed it to a 3-line dormant stub:

```yaml
name: deprecated
on:
  workflow_dispatch:
```

This file needs to be **removed from the filesystem entirely**, not emptied or stubbed.

**Action**:

```bash
rm .github/workflows/deploy.yml
```

**Do NOT modify any other file in `.github/`.**

**Acceptance criteria**:

- `.github/workflows/deploy.yml` does not exist
- `ls .github/workflows/` returns exactly: `backend-deploy.yml ci.yml mobile-build.yml mobile-release.yml pr-validation.yml`

---

## FIX 2: Remove the blocking audit job from ci.yml

**Problem**: The agent added an `audit` job to `ci.yml` (lines 41-51) that runs `npm audit --audit-level=high`. This will **block the entire CI pipeline** when any high-severity npm advisory exists — which in a monorepo with 100+ dependencies is virtually guaranteed to happen constantly.

This is redundant: `pr-validation.yml` already has a `security-audit` job that runs `npm audit --production --audit-level=high || true` — note the `|| true` which makes it **informational, not blocking**. That's the correct pattern for npm audit in CI.

**File**: `.github/workflows/ci.yml`

**Action**: Remove lines 41-51 entirely (the `audit` job):

```yaml
audit:
  name: Security Audit
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
    - run: npm ci
    - run: npm audit --audit-level=high
```

Delete these lines. Do NOT add `|| true` — just remove the job entirely since `pr-validation.yml` already covers this.

**Keep everything else in ci.yml** — the JWT_SECRET additions to `test` (lines 64-65) and `feature-flag-matrix` (lines 137-138) are correct fixes.

**Acceptance criteria**:

- `grep -c 'audit' .github/workflows/ci.yml` returns `0`
- The file has 6 jobs: lint, typecheck, test, build, secrets-check, feature-flag-matrix
- `grep -c 'jobs:' .github/workflows/ci.yml` returns `1`
- The JWT_SECRET env vars in test and feature-flag-matrix jobs remain

---

## Validation

```bash
# FIX 1: deploy.yml gone
ls .github/workflows/
# Expected: backend-deploy.yml ci.yml mobile-build.yml mobile-release.yml pr-validation.yml

# FIX 2: no audit job in ci.yml
grep 'audit' .github/workflows/ci.yml
# Expected: no output

# FIX 2: still has 6 jobs
grep 'name:' .github/workflows/ci.yml
# Expected: CI, Lint, Type Check, Unit Tests, Build, Secrets Check, Test (...)
```
