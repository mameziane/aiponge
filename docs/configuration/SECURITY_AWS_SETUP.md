# AWS Security Setup for aiponge

## Overview

This document covers the essential security configurations required before deploying Aiponge to AWS for App Store release.

## 1. Entry Encryption (CRITICAL)

All user book entries are encrypted at rest using AES-256-GCM encryption. This protects sensitive mental health data even if the database is compromised.

### Required Environment Variable

```bash
ENTRY_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

### Generating the Encryption Key

Generate a secure encryption key using one of these methods:

**Option 1: Node.js (recommended)**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Option 2: OpenSSL**
```bash
openssl rand -base64 32
```

### AWS Secrets Manager Setup

1. Create a secret in AWS Secrets Manager:
   ```bash
   aws secretsmanager create-secret \
     --name aiponge/entry-encryption-key \
     --secret-string "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
   ```

2. Grant your ECS task role access to the secret:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue"
         ],
         "Resource": "arn:aws:secretsmanager:*:*:secret:aiponge/entry-encryption-key-*"
       }
     ]
   }
   ```

3. Reference in ECS task definition:
   ```json
   {
     "secrets": [
       {
         "name": "ENTRY_ENCRYPTION_KEY",
         "valueFrom": "arn:aws:secretsmanager:region:account:secret:aiponge/entry-encryption-key"
       }
     ]
   }
   ```

### Key Rotation

- The encryption key should be rotated annually or after any suspected breach
- Key rotation requires re-encrypting existing data - plan for maintenance window
- Keep old keys accessible during migration period

## 2. Internal Service Authentication

Services communicate using HMAC-signed headers to prevent unauthorized access.

### Required Environment Variable

```bash
INTERNAL_SERVICE_SECRET=<base64-encoded-32-byte-key>
```

Generate the same way as the encryption key and store in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name aiponge/internal-service-secret \
  --secret-string "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
```

## 3. Database Security (RDS)

### Enable Encryption at Rest

When creating your RDS instance:
- Enable "Encryption" option
- Use AWS-managed key or create a Customer Managed Key (CMK)

### Enable SSL/TLS for Connections

Add to your connection string:
```
?sslmode=require
```

### Private Subnet Configuration

- Place RDS in private subnets (no internet access)
- Use security groups to restrict access to only your ECS services

## 4. Network Security

### VPC Configuration

```
VPC
├── Public Subnets (ALB only)
├── Private Subnets (ECS services)
└── Isolated Subnets (RDS, Redis)
```

### Security Groups

**API Gateway Service**
- Inbound: 443 from ALB
- Outbound: All internal services on their respective ports

**User Service / Music Service / Other Services**
- Inbound: Only from API Gateway security group
- Outbound: RDS, Redis, external APIs

**RDS**
- Inbound: PostgreSQL (5432) from service security groups only
- Outbound: None

## 5. Required Secrets Summary

Store these in AWS Secrets Manager:

| Secret Name | Description | Required |
|------------|-------------|----------|
| `aiponge/entry-encryption-key` | AES-256 key for book entry encryption | Yes |
| `aiponge/internal-service-secret` | HMAC key for service-to-service auth | Yes |
| `aiponge/jwt-secret` | JWT signing key for user auth | Yes |
| `aiponge/database-url` | PostgreSQL connection string | Yes |

## 6. Pre-Launch Checklist

- [ ] Generate and store `ENTRY_ENCRYPTION_KEY` in Secrets Manager
- [ ] Generate and store `INTERNAL_SERVICE_SECRET` in Secrets Manager
- [ ] Enable RDS encryption at rest
- [ ] Enable RDS SSL/TLS connections
- [ ] Configure private subnets for services
- [ ] Set up security groups
- [ ] Enable CloudWatch logging for all services
- [ ] Set up CloudWatch alarms for failed authentication attempts
- [ ] Configure automated RDS backups (minimum 7 days retention)
- [ ] Test backup restoration process

## 7. Monitoring Recommendations

### CloudWatch Alarms

Set up alerts for:
- Unusual number of failed authentication attempts
- Database connection failures
- Service health check failures
- High latency on internal service calls

### Logging

Ensure all services log:
- Authentication failures (without sensitive data)
- Encryption/decryption errors
- Internal service call failures
