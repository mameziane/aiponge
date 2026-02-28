# Load Testing with k6

## Prerequisites

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Running Tests

All tests accept a `BASE_URL` environment variable (defaults to `http://localhost:8080`).

### Individual Scripts

```bash
# Health check (quick smoke test)
k6 run tests/load/scripts/health-check.js

# Authentication flow (register, login, refresh)
k6 run tests/load/scripts/auth-flow.js

# Library browsing patterns
k6 run tests/load/scripts/library-browsing.js

# Music generation (with polling)
k6 run tests/load/scripts/music-generation.js

# Full scenario (smoke + load + spike)
k6 run tests/load/scripts/full-scenario.js

# Async music generation (BullMQ queue-based)
k6 run tests/load/scripts/music-generation-async.js

# Cached metadata endpoints
k6 run tests/load/scripts/cached-metadata.js
```

### Against Staging

```bash
k6 run -e BASE_URL=https://staging.aiponge.com tests/load/scripts/full-scenario.js
```

### With JSON Output

```bash
k6 run --out json=results.json tests/load/scripts/full-scenario.js
```

## Test Descriptions

| Script                 | Purpose                                    | VUs      | Duration |
| ---------------------- | ------------------------------------------ | -------- | -------- |
| health-check           | Verify basic availability under load       | 50       | ~50s     |
| auth-flow              | Register/login/refresh token rotation      | 10+5     | ~55s     |
| library-browsing       | Guest library list and detail access       | 20       | ~70s     |
| music-generation       | Song generation requests with polling      | 5        | ~80s     |
| music-generation-async | Async BullMQ generation with polling       | 5        | ~80s     |
| cached-metadata        | Static metadata endpoint cache performance | 20       | ~60s     |
| full-scenario          | Combined smoke/load/spike test             | 1→50→100 | ~5min    |

## Thresholds

Thresholds are defined in `thresholds.json` and embedded in each script. Key targets:

- **Health check**: p95 < 200ms, error rate < 1%
- **Auth endpoints**: p95 < 1s, error rate < 5%
- **Library browsing**: p95 < 500ms, error rate < 5%
- **Music generation**: p95 < 2s, error rate < 10% (async operations)
- **Async generation**: p95 < 3s, error rate < 10% (queue-based operations)
- **Cached metadata**: p95 < 100ms, error rate < 1% (should be near-instant from cache)
- **Full scenario**: p95 < 1.5s, error rate < 5%

## CI Integration

Add to your CI pipeline:

```yaml
- name: Run load tests
  run: |
    k6 run --quiet tests/load/scripts/health-check.js
    k6 run --quiet tests/load/scripts/auth-flow.js
```
