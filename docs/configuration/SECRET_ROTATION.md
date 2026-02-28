# Secret Rotation Guide

## Generating a New JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

This produces a 128-character hex string suitable for production use.

## Where Secrets Are Stored

| Environment | Storage |
|---|---|
| Local Development | `.env` files (git-ignored, never committed) |
| Replit Dev/Staging | Replit Secrets tab |
| AWS Production | AWS Secrets Manager (referenced by Terraform) |

## Rotation Procedure

1. **Generate new secret**: Run the command above.
2. **Deploy to secrets manager**: Update the secret in the appropriate storage for your environment.
3. **Rolling restart**: Restart services one at a time. During the transition window, new tokens are signed with the new secret while old tokens remain valid until they expire.
4. **Token expiry**: Access tokens expire after 15 minutes. Refresh tokens expire after 30 days. After 30 days, all sessions signed with the old secret will have expired naturally.
5. **Emergency revocation**: If the old secret was compromised, use the token blacklist to immediately revoke all existing tokens and force re-authentication.

## Required Secrets Per Service

| Service | Required Secrets |
|---|---|
| api-gateway | `JWT_SECRET`, `SERVICE_AUTH_KEY` |
| user-service | `JWT_SECRET`, `DATABASE_URL` |
| All AI services | `OPENAI_API_KEY`, `MUSICAPI_API_KEY` |
| storage-service | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| system-service | `DATABASE_URL` |

## Compromised Secret Detection

All services validate at startup that:
- `JWT_SECRET` is present and not empty
- `JWT_SECRET` does not contain the known compromised value `aiponge-dev-secret-1759653153`

Services will refuse to start if either check fails.
