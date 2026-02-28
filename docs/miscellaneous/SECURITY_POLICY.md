# Security Policy - Aiponge Platform

## Overview

This document outlines the security measures implemented in the Aiponge platform to protect user data, ensure compliance with privacy regulations (GDPR/CCPA), and maintain system integrity.

---

## 1. PII (Personally Identifiable Information) Protection

### 1.1 Data Classification

| Category | Examples | Protection Level |
|----------|----------|------------------|
| **Highly Sensitive** | Entries, insights, personal reflections | AES-256-GCM encryption at rest |
| **Sensitive PII** | Email, phone, IP address | Masked in logs, validated at input |
| **Authentication Data** | Passwords, tokens, API keys | Bcrypt hashing, token blacklist |
| **User Preferences** | Settings, onboarding data | Standard database storage |

### 1.2 Encryption at Rest (Highly Sensitive Data)

**Algorithm:** AES-256-GCM (Authenticated Encryption)

**Implementation:** `EncryptionService` in `packages/services/user-service/src/infrastructure/services/EncryptionService.ts`

**Features:**
- 256-bit encryption key (32 bytes)
- Random 16-byte IV per encryption operation
- 16-byte authentication tag for tamper detection
- Encrypted values prefixed with `ENC:` for identification

**Encrypted Fields:**
- User entries (personal reflections)
- AI-generated insights
- Sensitive personal content

**Key Management:**
- Encryption key stored in `ENTRY_ENCRYPTION_KEY` environment secret
- Key must be exactly 32 bytes, base64 encoded
- Service fails fast without valid key (no silent fallback)

**Key Generation:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 1.3 PII Sanitization in Logging

**Implementation:** `packages/platform-core/src/logging/formatting.ts`

All logs are automatically sanitized to mask PII before output:

| PII Type | Masking Format | Example |
|----------|----------------|---------|
| Email | `ex***@d***.com` | `john.doe@example.com` → `jo***@e***.com` |
| Phone | `***-4567` | `+1-555-123-4567` → `***-4567` |
| IP Address | `192.168.***.***` | `192.168.1.100` → `192.168.***.***` |
| SSN | `***-**-****` | `123-45-6789` → `***-**-****` |
| Credit Card | `****-****-****-****` | `4111-1111-1111-1111` → `****-****-****-****` |

**Sanitization Functions:**
- `maskEmail()` - Preserves first 2 chars + domain hint
- `maskPhone()` - Preserves last 4 digits
- `maskIpAddress()` - Masks last 2 IPv4 octets or last 4 IPv6 segments
- `sanitizePii()` - Recursive object sanitization
- `sanitizeForLogging()` - Combined secrets + PII masking

**Key-Based Detection:**
Fields named `email`, `phone`, `ip`, `ipAddress`, `phone_e164` are automatically masked.

**Value-Based Detection:**
String content matching email/phone/SSN/credit card patterns is masked automatically.

---

## 2. Authentication Security

### 2.1 Password Security

- **Hashing:** bcrypt with configurable salt rounds (default: 12)
- **Validation:** Minimum 8 characters, mixed case recommended
- **Storage:** Only password hash stored, never plaintext

### 2.2 Account Lockout Protection

**Implementation:** Progressive lockout after failed login attempts

| Failed Attempts | Lockout Duration |
|-----------------|------------------|
| 3 | 5 minutes |
| 5 | 15 minutes |
| 7 | 30 minutes |
| 10+ | 60 minutes |

**Database Columns:**
- `failed_login_attempts` - Counter for failed attempts
- `locked_until` - Timestamp when lockout expires

**Behavior:**
- Counter resets on successful login
- Lockout applies globally to account (not per-IP)
- User notified of lockout with remaining time

### 2.3 Token Blacklist (JWT Revocation)

**Implementation:** `TokenBlacklistService` in user-service

**Purpose:** Enable immediate token invalidation for:
- User logout
- Password changes
- Security revocations
- "Logout all sessions" feature

**Database Table:** `usr_token_blacklist`
- `token_jti` - JWT ID (jti claim) for identification
- `user_id` - Owner of the token
- `reason` - logout | password_change | security_revoke | all_sessions
- `expires_at` - Original token expiration (for cleanup)

**JWT Enhancement:**
- All tokens include unique `jti` (JWT ID) claim
- Tokens validated against blacklist before acceptance

### 2.4 Session Security

- JWT tokens with configurable expiration (default: 7 days)
- Secure cookie settings (HttpOnly, SameSite, Secure in production)
- Token refresh mechanism for active sessions

---

## 3. API Security

### 3.1 Rate Limiting

**Implementation:** Dual-layer rate limiting

| Layer | Scope | Limits |
|-------|-------|--------|
| **API Gateway** | All /api/* routes | 100 requests/15 min per IP |
| **Auth Endpoints** | /api/auth/* | 50 requests/15 min per IP |

**Redis Support:**
- Production: Redis-based distributed rate limiting
- Development: In-memory fallback
- Automatic Redis reconnection with graceful degradation

### 3.2 Request Body Limits

**Default:** 1MB maximum request body size

**Purpose:** Prevent DoS attacks via large payloads

**Route-Specific Overrides:**
- RevenueCat webhooks: Raw body (before JSON parsing)
- File uploads: Per-route limits via multer

### 3.3 Security Headers (Helmet.js)

**Implementation:** `helmet` middleware in API Gateway

**Headers Applied:**
- `Content-Security-Policy` - Strict CSP directives
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Resource-Policy: cross-origin`

**CSP Directives:**
```javascript
{
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'", ...corsOrigins],
  fontSrc: ["'self'", "https:", "data:"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"]
}
```

### 3.4 CSRF Protection

**Implementation:** `CsrfProtectionMiddleware` in API Gateway

**Scope:** Admin routes (state-changing operations)

**Validation:**
- Origin header must match allowed origins
- Referer header must match allowed origins
- Applies to POST, PUT, DELETE, PATCH methods

---

## 4. Internal Service Security

### 4.1 Service-to-Service Authentication

**Implementation:** `packages/platform-core/src/auth/service-auth.ts`

**Purpose:** Prevent header spoofing attacks where malicious clients set arbitrary user IDs

**Mechanism:**
1. API Gateway signs `x-user-id` header using HMAC-SHA256
2. Signed headers include:
   - `x-user-id` - The authenticated user's ID
   - `x-user-id-signature` - HMAC signature
   - `x-user-id-timestamp` - Signature timestamp
   - `x-gateway-service` - Source identification
3. Receiving services verify signature before trusting header

**Environment Variable:** `INTERNAL_SERVICE_SECRET`
- Required in production for signature generation/verification
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Without this secret, services operate in development mode (trust-but-warn)

**Signature Properties:**
- Algorithm: HMAC-SHA256
- TTL: 5 minutes (prevents replay attacks)
- Timing-safe comparison to prevent timing attacks

**Usage in Services:**
```typescript
import { serviceAuthMiddleware } from '@aiponge/platform-core';

// Apply to routes that use x-user-id
app.use('/api/protected', serviceAuthMiddleware({ required: true }));
```

### 4.2 Service Discovery

- Dynamic service registration with API Gateway
- Health check endpoints for service availability
- Circuit breaker protection for external APIs

---

## 5. Data Protection Compliance

### 5.1 GDPR/CCPA Compliance Features

| Requirement | Implementation |
|-------------|----------------|
| Right to access | User data export endpoint |
| Right to deletion | Account deletion with cascade |
| Data minimization | Only necessary data collected |
| Encryption at rest | AES-256-GCM for sensitive data |
| Logging sanitization | PII masked in all logs |

### 5.2 Account Deletion

**Endpoint:** Delete Account feature in profile settings

**Behavior:**
- All user data permanently deleted
- Cascading deletion for related records
- Music, entries, preferences removed
- Irreversible operation with confirmation

---

## 6. Audit and Monitoring

### 6.1 Correlation IDs

- Every request assigned unique correlation ID
- ID propagated across service boundaries
- Enables request tracing and debugging

### 6.2 Structured Logging

- JSON format in production
- Winston logger with level-based filtering
- Correlation context automatically included
- PII sanitized before output

### 6.3 Error Tracking

- Correlation IDs in error responses
- Stack traces sanitized in production
- Structured error serialization

---

## 7. Security Checklist

### Deployment Prerequisites

- [ ] `ENTRY_ENCRYPTION_KEY` secret configured (32 bytes, base64)
- [ ] `INTERNAL_SERVICE_SECRET` secret configured (32 bytes, hex)
- [ ] `REVENUECAT_WEBHOOK_SECRET` configured for payment webhooks
- [ ] Redis configured for production rate limiting
- [ ] CORS origins restricted to production domains
- [ ] TLS/HTTPS enforced for all traffic

### Regular Maintenance

- [ ] Quarterly security audit (`npm audit`)
- [ ] Monitor for dependency vulnerabilities
- [ ] Review rate limit thresholds
- [ ] Check token blacklist cleanup job
- [ ] Verify encryption key rotation plan

---

## 8. Incident Response

### Token Compromise

1. Use "Logout all sessions" to blacklist all user tokens
2. Force password reset
3. Investigate access logs
4. Notify user of security event

### Encryption Key Rotation

1. Generate new encryption key
2. Decrypt existing data with old key
3. Re-encrypt with new key
4. Update `ENTRY_ENCRYPTION_KEY` secret
5. Deploy and verify

---

## 9. Secret Rotation Policy

### 9.1 Rotation Schedule

| Secret | Rotation Frequency | Method |
|--------|-------------------|--------|
| `ENTRY_ENCRYPTION_KEY` | Annually or on compromise | Re-encrypt all data (see Section 8) |
| `INTERNAL_SERVICE_SECRET` | Quarterly | Rolling update across services |
| `JWT_SECRET` | Quarterly | Issue new tokens, blacklist old |
| `REVENUECAT_WEBHOOK_SECRET` | On compromise | Rotate in RevenueCat dashboard |
| Database passwords | Quarterly | Coordinated with RDS rotation |
| `EXPO_TOKEN` | On compromise | Regenerate in Expo dashboard |
| `RESEND_API_KEY` | Annually | Rotate in Resend dashboard |

### 9.2 Rotation Procedure

1. Generate new secret value using cryptographically secure method
2. Update the secret in the secrets manager (AWS Secrets Manager / Replit Secrets)
3. Deploy services that consume the secret (rolling deployment)
4. Verify service health via `/health/ready` endpoints
5. Invalidate old secret after confirmation period (24h recommended)
6. Document rotation in incident log

### 9.3 Emergency Rotation (Compromise Response)

1. Immediately generate and deploy new secret
2. Blacklist all active tokens if auth secrets compromised
3. Force re-authentication for all users
4. Audit access logs for the exposure window
5. Notify affected users per GDPR Article 34 if personal data at risk

### 9.4 Automation

- CI/CD pipeline includes `secrets-check` job to detect committed secrets
- `.env` files are gitignored and verified not tracked (R13 check)
- See `docs/SECRET_ROTATION.md` for detailed runbooks per secret type

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| December 2025 | 1.0 | Initial security policy document |
| February 2026 | 1.1 | Added Section 9: Secret Rotation Policy |

---

## Contact

For security concerns or vulnerability reports, contact the development team through appropriate channels.
