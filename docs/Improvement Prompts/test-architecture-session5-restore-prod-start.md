# Session 5 — Restore prod-start.sh

## PROBLEM

deploy/build/prod-start.sh was deleted (committed in 663b34685 "Saved progress at the end of the loop") but .replit line 16 still references it:

```
run = "./deploy/build/prod-start.sh"
```

This means Replit production deployments are broken — the run command points to a file that no longer exists.

The CI/CD workflow fixes (backend-deploy.yml, ci.yml, pr-validation.yml) were all applied correctly. CorsMiddleware and ETagMiddleware were cleanly removed (both source and test files deleted together, no dangling imports). Those are fine.

The ONLY issue is the deleted prod-start.sh.

## FIX

Restore the file from git history:

```bash
git checkout HEAD~1 -- deploy/build/prod-start.sh
```

If that fails (because the parent commit also has it deleted), use:

```bash
git show 695e6923a:deploy/build/prod-start.sh > deploy/build/prod-start.sh
chmod +x deploy/build/prod-start.sh
```

If that also fails, find the last commit that had the file:

```bash
git log --all --follow -1 -- deploy/build/prod-start.sh
```

Then restore from that commit hash.

## VERIFICATION

1. `ls -la deploy/build/prod-start.sh` — must exist and be executable
2. `head -3 deploy/build/prod-start.sh` — should show #!/bin/bash and set -e
3. `grep "prod-start" .replit` — must still reference the file (do NOT modify .replit)
4. The file should contain the full production startup script that starts all 8 microservices sequentially (system-service first, then the rest, then api-gateway in foreground)

Do NOT modify .replit, docs/SCRIPTS_README.md, or any workflow files. Only restore the deleted script.
