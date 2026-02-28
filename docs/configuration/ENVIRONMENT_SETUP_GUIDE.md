# Aiponge Environment Setup Guide

## When You Need This Guide

Use this guide when:

1. Deploying to production
2. Setting up a new development machine
3. Troubleshooting connection or timeout issues
4. Customizing service behavior

---

## Development Setup (Replit)

**No action needed.** All services work with built-in defaults:

- Timeouts: 30 seconds (120 seconds for AI generation)
- CORS: Allows all origins in development
- Database: Uses your Replit DATABASE_URL automatically

---

## Production Deployment Checklist

### Step 1: Required Secrets (Set in Replit Secrets tab)

These MUST be set before deploying:

| Secret             | Where to Get It                     |
| ------------------ | ----------------------------------- |
| `DATABASE_URL`     | Replit auto-provides this           |
| `JWT_SECRET`       | Generate: `openssl rand -base64 32` |
| `OPENAI_API_KEY`   | OpenAI Platform > API keys          |
| `MUSICAPI_API_KEY` | MusicAPI.ai Dashboard               |

### Step 2: Required Environment Variables

Set these in Replit's Secrets tab for production:

```
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
NODE_ENV=production
```

### Step 3: Optional Tuning (Only If Needed)

**Adjust timeouts** (if AI generation is timing out):

```
AI_REQUEST_TIMEOUT_MS=180000
```

**Adjust rate limits** (if users hit limits too quickly):

```
RATE_LIMIT_MAX=200
RATE_LIMIT_WINDOW=60000
```

---

## Troubleshooting Guide

### Problem: AI music generation times out

**Solution:** Increase AI timeout

```
AI_REQUEST_TIMEOUT_MS=180000
```

(Default is 120000 = 2 minutes, increase to 180000 = 3 minutes)

### Problem: CORS errors in browser console

**Solution:** Set allowed origins explicitly

```
CORS_ALLOWED_ORIGINS=http://localhost:5000,http://localhost:3000
```

### Problem: Services can't communicate

**Solution:** Check service discovery settings

```
SERVICE_HOST=localhost
```

### Problem: Database connection drops

**Solution:** Adjust connection pool settings

```
DB_MAX_CONNECTIONS=20
DATABASE_IDLE_TIMEOUT_MS=60000
```

---

## Complete Variable Reference

### Timeouts (milliseconds)

| Variable                      | Default | Purpose                          |
| ----------------------------- | ------- | -------------------------------- |
| `HEALTH_CHECK_TIMEOUT_MS`     | 5000    | Health check requests            |
| `INTERNAL_SERVICE_TIMEOUT_MS` | 10000   | Service-to-service calls         |
| `EXTERNAL_SERVICE_TIMEOUT_MS` | 30000   | Third-party API calls            |
| `AI_REQUEST_TIMEOUT_MS`       | 120000  | AI generation (OpenAI, MusicAPI) |

### Retries

| Variable                   | Default | Purpose                     |
| -------------------------- | ------- | --------------------------- |
| `HEALTH_CHECK_RETRIES`     | 1       | Health check retry attempts |
| `INTERNAL_SERVICE_RETRIES` | 3       | Service-to-service retries  |
| `EXTERNAL_SERVICE_RETRIES` | 2       | Third-party API retries     |
| `AI_REQUEST_RETRIES`       | 2       | AI generation retries       |

### Circuit Breaker (Advanced)

| Variable                           | Default | Purpose                 |
| ---------------------------------- | ------- | ----------------------- |
| `CIRCUIT_BREAKER_TIMEOUT_MS`       | 30000   | When to trip circuit    |
| `CIRCUIT_BREAKER_ERROR_THRESHOLD`  | 50      | Error % to open circuit |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | 30000   | Time before retry       |

---

## Quick Reference Card

**For Development:** Do nothing - defaults work

**For Production:** Set these 4 things:

1. `JWT_SECRET` - your secret key
2. `OPENAI_API_KEY` - from OpenAI
3. `MUSICAPI_API_KEY` - from MusicAPI.ai
4. `CORS_ALLOWED_ORIGINS` - your domain(s)

**If something times out:** Increase `AI_REQUEST_TIMEOUT_MS`

**If CORS fails:** Set `CORS_ALLOWED_ORIGINS` explicitly
