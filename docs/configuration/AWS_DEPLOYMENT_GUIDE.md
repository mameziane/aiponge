# AWS Deployment Guide - Aiponge Platform

Complete guide to deploying Aiponge microservices to AWS using ECS Fargate, including S3 storage, CloudFront CDN, and production-ready infrastructure.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Flight Checklist](#pre-flight-checklist)
4. [Infrastructure Setup](#infrastructure-setup)
   - [VPC and Networking](#1-vpc-and-networking)
   - [Security Groups](#2-security-groups)
   - [RDS PostgreSQL](#3-rds-postgresql)
   - [ElastiCache Redis](#4-elasticache-redis)
   - [S3 Storage](#5-s3-storage)
   - [CloudFront CDN](#6-cloudfront-cdn)
   - [ECS Cluster](#7-ecs-cluster)
   - [Load Balancer](#8-application-load-balancer)
5. [IAM Policies](#iam-policies)
6. [Secrets Management](#secrets-management)
7. [Environment Variables](#environment-variables)
8. [CI/CD Deployment](#cicd-deployment)
9. [Deployment Steps](#deployment-steps)
10. [Resilience & High Availability](#resilience--high-availability)
11. [Monitoring & Logging](#monitoring--logging)
12. [Cost Estimation](#cost-estimation)
13. [Troubleshooting](#troubleshooting)
14. [Rollback Procedures](#rollback-procedures)
15. [Security Best Practices](#security-best-practices)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 AWS Cloud                                  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                              VPC                                    │   │
│  │                                                                     │   │
│  │   ┌─────────────┐                                                   │   │
│  │   │ CloudFront  │ ◄─── Mobile App (Expo)                            │   │
│  │   │    (CDN)    │                                                   │   │
│  │   └──────┬──────┘                                                   │   │
│  │          │                                                          │   │
│  │   ┌──────▼──────┐                                                   │   │
│  │   │     ALB     │  Application Load Balancer                        │   │
│  │   └──────┬──────┘                                                   │   │
│  │          │                                                          │   │
│  │   ┌──────▼──────────────────────────────────────────────────────┐   │   │
│  │   │                    ECS Cluster (Fargate)                    │   │   │
│  │   │                                                             │   │   │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │   │
│  │   │  │ API Gateway │  │   System    │  │   Storage   │          │   │   │
│  │   │  │   :8080     │  │   :3001     │  │   :3002     │          │   │   │
│  │   │  └─────────────┘  └─────────────┘  └─────────────┘          │   │   │
│  │   │                                                             │   │   │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │   │
│  │   │  │User Profile │  │  AI Config  │  │ AI Content  │          │   │   │
│  │   │  │   :3003     │  │   :3004     │  │   :3005     │          │   │   │
│  │   │  └─────────────┘  └─────────────┘  └─────────────┘          │   │   │
│  │   │                                                             │   │   │
│  │   │  ┌─────────────┐  ┌─────────────┐                           │   │   │
│  │   │  │AI Analytics │  │   Music     │                           │   │   │
│  │   │  │   :3006     │  │   :3007     │                           │   │   │
│  │   │  └─────────────┘  └─────────────┘                           │   │   │
│  │   │                                                             │   │   │
│  │   └─────────────────────────┬───────────────────────────────────┘   │   │
│  │                             │                                       │   │
│  │   ┌─────────────────────────▼───────────────────────────────────┐   │   │
│  │   │                      RDS Proxy                              │   │   │
│  │   └─────────────────────────┬───────────────────────────────────┘   │   │
│  │                             │                                       │   │
│  │   ┌─────────────────────────▼───────────────────────────────────┐   │   │
│  │   │               RDS PostgreSQL (Multi-AZ)                     │   │   │
│  │   │  Schemas: system, storage, user, ai_config,                 │   │   │
│  │   │           ai_content, ai_analytics, music                   │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                   ElastiCache Redis                         │   │   │
│  │   │              (Session, Cache, Rate Limiting)                │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                      S3 Bucket                              │   │   │
│  │   │              (Music, Artwork, User Media)                   │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Required Tools

- AWS CLI v2 installed and configured
- Docker installed locally (for testing builds)
- Git with access to the repository
- Node.js 20+ (for local development)

### Required AWS Permissions

Create an IAM user with deployment permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:*",
        "ecs:*",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "elasticloadbalancing:*",
        "logs:*",
        "secretsmanager:GetSecretValue",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Pre-Flight Checklist

### AWS Resources Required

- [ ] **VPC** with public/private subnets across 2+ AZs
- [ ] **RDS PostgreSQL** (db.t3.micro for dev, db.r6g.large for prod)
- [ ] **ElastiCache Redis** (cache.t3.micro for dev, cache.r6g.large for prod)
- [ ] **S3 Bucket** for audio/asset storage
- [ ] **CloudFront Distribution** for CDN
- [ ] **ECR Repository** for container images
- [ ] **ECS Cluster** (Fargate)
- [ ] **Application Load Balancer**
- [ ] **Secrets Manager** for credentials
- [ ] **CloudWatch Log Groups** for each service

### Secrets to Configure

Create a secret in AWS Secrets Manager:

```json
{
  "DATABASE_URL": "postgres://user:password@rds-host:5432/aiponge",
  "REDIS_URL": "redis://elasticache-host:6379",
  "JWT_SECRET": "<generate-with-openssl-rand-base64-64>",
  "INTERNAL_SERVICE_SECRET": "<generate-with-openssl-rand-hex-32>",
  "ENTRY_ENCRYPTION_KEY": "<generate-with-openssl-rand-base64-32>",
  "REVENUECAT_API_KEY": "...",
  "MUSICAPI_API_KEY": "...",
  "SENDGRID_API_KEY": "..."
}
```

---

## Infrastructure Setup

### 1. VPC and Networking

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=aiponge-vpc}]'

# Create public subnets (for ALB)
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a

aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b

# Create private subnets (for ECS tasks)
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.10.0/24 \
  --availability-zone us-east-1a

aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1b
```

### 2. Security Groups

```bash
# ALB Security Group (public)
aws ec2 create-security-group \
  --group-name aiponge-alb-sg \
  --description "ALB Security Group" \
  --vpc-id vpc-xxx

aws ec2 authorize-security-group-ingress \
  --group-id sg-alb \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# ECS Tasks Security Group (private)
aws ec2 create-security-group \
  --group-name aiponge-ecs-sg \
  --description "ECS Tasks Security Group" \
  --vpc-id vpc-xxx

# Allow ALB to reach ECS tasks
aws ec2 authorize-security-group-ingress \
  --group-id sg-ecs \
  --protocol tcp \
  --port 8080 \
  --source-group sg-alb

# Allow ECS tasks to communicate with each other
aws ec2 authorize-security-group-ingress \
  --group-id sg-ecs \
  --protocol tcp \
  --port 3001-3007 \
  --source-group sg-ecs

# Database Security Group
aws ec2 create-security-group \
  --group-name aiponge-db-sg \
  --description "Database Security Group" \
  --vpc-id vpc-xxx

aws ec2 authorize-security-group-ingress \
  --group-id sg-db \
  --protocol tcp \
  --port 5432 \
  --source-group sg-ecs
```

### 3. RDS PostgreSQL

```bash
# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name aiponge-db-subnet \
  --db-subnet-group-description "Aiponge DB Subnets" \
  --subnet-ids subnet-private-1 subnet-private-2

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier aiponge-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 16.1 \
  --master-username aiponge_admin \
  --master-user-password "GENERATE_SECURE_PASSWORD" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-db \
  --db-subnet-group-name aiponge-db-subnet \
  --backup-retention-period 7 \
  --multi-az \
  --storage-encrypted \
  --publicly-accessible false
```

Create schemas for each service:

```sql
CREATE SCHEMA system_service;
CREATE SCHEMA storage_service;
CREATE SCHEMA user_service;
CREATE SCHEMA ai_config_service;
CREATE SCHEMA ai_content_service;
CREATE SCHEMA ai_analytics_service;
CREATE SCHEMA music_service;
```

### 4. ElastiCache Redis

```bash
# Create cache subnet group
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name aiponge-cache-subnet \
  --cache-subnet-group-description "Aiponge Cache Subnets" \
  --subnet-ids subnet-private-1 subnet-private-2

# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id aiponge-redis \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.t3.medium \
  --num-cache-nodes 1 \
  --cache-subnet-group-name aiponge-cache-subnet \
  --security-group-ids sg-db
```

### 5. S3 Storage

#### Create Bucket

```bash
aws s3api create-bucket \
  --bucket aiponge-production-storage \
  --region us-east-1
```

#### CORS Configuration

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": [
      "https://your-app.replit.app",
      "https://aiponge.com",
      "exp://*"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

#### Bucket Policy (for public read access)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::aiponge-production-storage/public/*"
    }
  ]
}
```

#### Storage Provider Configuration

Set environment variables:

```bash
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_BUCKET_NAME=aiponge-production-storage
CDN_DOMAIN=https://cdn.aiponge.com  # Optional
```

#### Enable S3 Provider in Code

The storage service uses dynamic provider selection. Update `packages/services/storage-service/src/main.ts`:

```typescript
// Initialize storage provider based on environment
let storageProvider: IStorageProvider;
const providerType = process.env.STORAGE_PROVIDER || 'local';

if (providerType === 's3') {
  // AWS S3 Provider
  const { S3StorageProvider } = await import('./infrastructure/providers/S3StorageProvider');
  storageProvider = new S3StorageProvider({
    bucket: process.env.S3_BUCKET_NAME || 'aiponge-storage',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    endpoint: process.env.S3_ENDPOINT, // Optional: for S3-compatible services
    cdnDomain: process.env.CDN_DOMAIN, // Optional: CloudFront domain
  });
  
  await storageProvider.initialize();
  
  logger.info('S3 Storage Provider initialized', {
    bucket: process.env.S3_BUCKET_NAME,
    region: process.env.AWS_REGION,
    cdnEnabled: !!process.env.CDN_DOMAIN,
  });
} else {
  // Local Storage Provider (default)
  const { LocalStorageProvider } = await import('./infrastructure/providers/LocalStorageProvider');
  storageProvider = new LocalStorageProvider(`${WORKSPACE_ROOT}/uploads`);
  
  logger.info('Local Storage Provider initialized', {
    basePath: `${WORKSPACE_ROOT}/uploads`,
  });
}
```

#### S3 Migration Checklist

When migrating from local storage to S3:

1. **Install AWS SDK Dependencies**
   ```bash
   cd packages/services/storage-service
   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   ```

2. **Set Environment Variables** (see above)

3. **Migrate Existing Files**
   ```bash
   aws s3 sync ./uploads s3://aiponge-production-storage/
   ```

4. **Verify Migration**
   - Generate a test song in the app
   - Check S3 bucket for new files (`music/`, `artwork/`)
   - Test playback from S3 URLs

5. **Verify Access**
   - Copy S3 object URL
   - Open in browser to verify public access

#### S3 Troubleshooting

**"Access Denied" Error:**
- Verify IAM user permissions match policy above
- Check bucket policy allows required operations
- Confirm credentials in environment match IAM user
- Test with AWS CLI: `aws s3 ls s3://your-bucket/`

**"Bucket Not Found":**
- Bucket names are case-sensitive
- Verify `AWS_REGION` matches bucket region
- Confirm bucket exists in AWS Console

**CORS Errors in Browser:**
- Add app domains to CORS policy
- Include `exp://*` for Expo development
- Clear browser cache after changes

**Slow Upload/Download:**
- Use CloudFront CDN for global distribution
- Enable S3 Transfer Acceleration
- Choose region closest to users

### 6. CloudFront CDN

Create CloudFront distribution for audio/media delivery:

```bash
# Create Origin Access Identity
aws cloudfront create-cloud-front-origin-access-identity \
  --cloud-front-origin-access-identity-config \
    CallerReference=aiponge-oai,Comment="Aiponge S3 OAI"

# Distribution configuration in deploy/aws/cloudfront-distribution.json
```

S3 Bucket Policy for CloudFront:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAI",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${OAI_ID}"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    }
  ]
}
```

### 7. ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name aiponge-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4 \
  --settings name=containerInsights,value=enabled
```

#### Create ECR Repositories

```bash
./deploy/aws/setup-ecr.sh
```

Or manually:

```bash
SERVICES=(
  "aiponge-system-service"
  "aiponge-storage-service"
  "aiponge-user-service"
  "aiponge-ai-config-service"
  "aiponge-ai-content-service"
  "aiponge-ai-analytics-service"
  "aiponge-music-service"
  "aiponge-api-gateway"
)

for SERVICE in "${SERVICES[@]}"; do
  aws ecr create-repository \
    --repository-name $SERVICE \
    --region us-east-1 \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256
done
```

### 8. Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name aiponge-alb \
  --subnets subnet-public-1 subnet-public-2 \
  --security-groups sg-alb \
  --scheme internet-facing \
  --type application

# Create target group
aws elbv2 create-target-group \
  --name aiponge-api-gateway-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id vpc-xxx \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2

# Create HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:... \
  --default-actions Type=forward,TargetGroupArn=arn:aws:...
```

---

## IAM Policies

### ECS Task Execution Role Policy

Used for pulling images from ECR, writing logs, and accessing secrets.

See: `deploy/aws/iam-ecs-execution-role-policy.json`

Key permissions:
- ECR image pull
- CloudWatch Logs write
- Secrets Manager read
- SSM Parameter Store read
- KMS decrypt for secrets

### ECS Task Role Policy

Used by the running application for S3 access, metrics, and service discovery.

See: `deploy/aws/iam-ecs-task-role-policy.json`

Key permissions:
- S3 bucket access (read/write)
- CloudWatch metrics publish
- X-Ray tracing
- SQS/SNS messaging
- Service Discovery

---

## Secrets Management

Store secrets in AWS Secrets Manager:

```bash
# Database URL
aws secretsmanager create-secret \
  --name aiponge/database-url \
  --secret-string "postgresql://user:pass@host:5432/db"

# Redis URL
aws secretsmanager create-secret \
  --name aiponge/redis-url \
  --secret-string "redis://host:6379"

# API Keys
aws secretsmanager create-secret \
  --name aiponge/api-keys \
  --secret-string '{"OPENAI_API_KEY":"sk-...","MUSICAPI_API_KEY":"..."}'
```

### Critical Security Secrets

The following secrets protect sensitive user mental health data and must be generated securely:

#### ENTRY_ENCRYPTION_KEY (Required)

All user book entries are encrypted at rest using AES-256-GCM. This key is **required for production** - the service will fail to start without it.

**Generate the key:**

```bash
# Option 1: Node.js (recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 2: OpenSSL
openssl rand -base64 32
```

**Store in AWS Secrets Manager:**

```bash
aws secretsmanager create-secret \
  --name aiponge/entry-encryption-key \
  --secret-string "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
```

**Reference in ECS Task Definition:**

```json
{
  "secrets": [
    {
      "name": "ENTRY_ENCRYPTION_KEY",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:aiponge/entry-encryption-key"
    }
  ]
}
```

**Important Notes:**
- In development mode (`NODE_ENV=development`), a fallback key is used automatically
- In production, the service **will not start** without this key
- Key rotation requires re-encrypting existing data - plan for a maintenance window
- Keep backup of this key - lost key = lost data

#### INTERNAL_SERVICE_SECRET (Required)

Used for HMAC-signed headers between microservices to prevent unauthorized internal API access.

**Generate and store:**

```bash
aws secretsmanager create-secret \
  --name aiponge/internal-service-secret \
  --secret-string "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
```

#### JWT_SECRET (Required)

Used for signing user authentication tokens.

**Generate and store:**

```bash
aws secretsmanager create-secret \
  --name aiponge/jwt-secret \
  --secret-string "$(openssl rand -base64 64)"
```

For detailed security configuration, see: [docs/SECURITY_AWS_SETUP.md](./SECURITY_AWS_SETUP.md)

---

## Environment Variables

### All Services

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `production` or `staging` | Yes |
| `PORT` | Service port | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `INTERNAL_SERVICE_SECRET` | Inter-service auth secret | Yes |
| `ENTRY_ENCRYPTION_KEY` | AES-256-GCM encryption key | Yes |
| `LOG_LEVEL` | `info`, `debug`, `warn`, `error` | No |
| `CLUSTER_WORKERS` | `auto` for all CPU cores | No |
| `DATABASE_POOL_MAX` | Max DB connections (default: 50) | No |

### Database URLs (Per Service)

| Service | Variable | Fallback |
|---------|----------|----------|
| system-service | `SYSTEM_DATABASE_URL` | `DATABASE_URL` |
| storage-service | `STORAGE_DATABASE_URL` | `DATABASE_URL` |
| user-service | `USER_DATABASE_URL` | `DATABASE_URL` |
| ai-config-service | `AI_CONFIG_DATABASE_URL` | `DATABASE_URL` |
| ai-content-service | `AI_CONTENT_DATABASE_URL` | `DATABASE_URL` |
| ai-analytics-service | `AI_ANALYTICS_DATABASE_URL` | `DATABASE_URL` |
| music-service | `MUSIC_DATABASE_URL` | `DATABASE_URL` |

### Service-Specific Variables

**ai-config-service:**
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

**music-service:**
- `MUSICAPI_API_KEY`
- `ELEVENLABS_API_KEY`

**storage-service:**
- `STORAGE_PROVIDER` (s3 or local)
- `S3_BUCKET_NAME`
- `CDN_DOMAIN`

---

## CI/CD Deployment

### GitHub Secrets

Add these secrets to GitHub (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `AWS_ACCESS_KEY_ID` | IAM access key for CI/CD |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |

### Deployment Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Git Push   │───►│   Test &    │───►│   Build     │
│  to main    │    │   Lint      │    │   Docker    │
└─────────────┘    └─────────────┘    └──────┬──────┘
                                             │
                   ┌─────────────┐    ┌──────▼──────┐
                   │  Deployed!  │◄───│  Update     │
                   │             │    │  ECS        │
                   └─────────────┘    └─────────────┘
```

### Manual Deployment

```bash
gh workflow run deploy-aws.yml -f environment=staging
```

---

## Deployment Steps

### Step 1: Build and Push Container Images

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Build and push each service
for SERVICE in api-gateway system-service storage-service user-service ai-config-service ai-content-service ai-analytics-service music-service; do
  docker build \
    --build-arg SERVICE_PORT=3000 \
    --build-arg SERVICE_PATH=packages/services/$SERVICE \
    -t $ECR_REGISTRY/aiponge-$SERVICE:$VERSION \
    -f deploy/docker/Dockerfile.service .
  
  docker push $ECR_REGISTRY/aiponge-$SERVICE:$VERSION
done
```

### Step 2: Database Migration

```bash
npm run db:push
```

### Step 3: Deploy ECS Services

```bash
# Update task definition
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definition.json

# Update service
aws ecs update-service \
  --cluster aiponge-cluster \
  --service api-gateway \
  --task-definition aiponge-api-gateway:$TASK_REVISION \
  --force-new-deployment
```

### Step 4: Verify Deployment

```bash
curl https://your-alb-domain/health
curl https://your-alb-domain/health/services
curl https://your-alb-domain/ready
```

---

## Resilience & High Availability

### Current Resilience Features

| Feature | Status | Location |
|---------|--------|----------|
| Circuit Breakers (Internal) | Active | `api-gateway/CircuitBreakerManager.ts` |
| Circuit Breakers (External) | Active | `platform-core/resilience/ExternalApiCircuitBreaker.ts` |
| Service Discovery | Cached | `platform-core/service-locator/service-locator.ts` |
| Redis Fallbacks | Active | `ai-analytics-service/cache/RedisCache.ts` |
| HTTP Retry Logic | Active | `platform-core/http/HttpClient.ts` |
| Rate Limiting | Active | `api-gateway/middleware/RateLimitMiddleware.ts` |
| Health Checks | Active | All services expose `/health` endpoint |

### Pre-Deployment Tasks

1. **Load Balancer Redundancy**
   - Deploy 2+ API Gateway instances
   - Configure health check probes
   - Enable sticky sessions for WebSocket

2. **PostgreSQL High Availability**
   - Enable streaming replication
   - Configure automated failover
   - Set up connection pooling (PgBouncer)
   - Enable point-in-time recovery

3. **Redis Cluster**
   - Deploy Redis Sentinel or Cluster (3+ nodes)
   - Configure automatic failover
   - Enable AOF persistence

4. **CDN Configuration**
   - Configure CloudFront for audio files
   - Set cache headers: `Cache-Control: public, max-age=31536000, immutable`
   - Enable range requests for streaming

5. **Multi-Provider AI Failover**
   - ElevenLabs as secondary music provider
   - Automatic failover on circuit break

### ECS Auto Scaling

```yaml
TargetTrackingScaling:
  - MetricType: CPU
    TargetValue: 70
    ScaleOutCooldown: 60
    ScaleInCooldown: 300
  
  - MetricType: Memory
    TargetValue: 80
    ScaleOutCooldown: 60
    ScaleInCooldown: 300

MinCapacity: 2
MaxCapacity: 10
```

---

## Monitoring & Logging

### CloudWatch Logs

Each service logs to its own log group:

```
/ecs/aiponge-api-gateway
/ecs/aiponge-system-service
/ecs/aiponge-storage-service
/ecs/aiponge-user-service
/ecs/aiponge-ai-config-service
/ecs/aiponge-ai-content-service
/ecs/aiponge-ai-analytics-service
/ecs/aiponge-music-service
```

### Useful Log Queries

```sql
-- Find errors in last hour
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- Request latency
fields @timestamp, @message
| filter @message like /latency/
| stats avg(latency) by bin(5m)
```

### CloudWatch Alarms

| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| High CPU | ECS CPU Utilization | >80% for 5 min | Scale out + notify |
| High Memory | ECS Memory Utilization | >85% for 5 min | Scale out + notify |
| Error Rate | HTTP 5xx count | >10/min | Notify on-call |
| Latency | ALB target response time | >1s p95 | Notify |
| DB Connections | RDS connections | >80% max | Notify |

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name aiponge-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/health` | Load balancer | 200 OK |
| `/ready` | Readiness probe | 200 if dependencies OK |
| `/live` | Liveness probe | 200 if process alive |
| `/metrics` | Prometheus scraping | Metrics text |

---

## Cost Estimation

### Development Environment

| Resource | Recommended | Monthly Cost |
|----------|-------------|--------------|
| ECS Fargate | 0.25 vCPU, 0.5GB | ~$10 |
| RDS | db.t3.micro | ~$15 |
| ElastiCache | cache.t3.micro | ~$12 |
| S3 | <10GB | ~$1 |
| CloudFront | <50GB transfer | ~$5 |
| **Total** | | **~$43/month** |

### Production Environment (10K users)

| Resource | Recommended | Monthly Cost |
|----------|-------------|--------------|
| ECS Fargate (8 services) | 0.5 vCPU, 1GB each | ~$120 |
| RDS PostgreSQL | db.t3.medium, Multi-AZ | ~$100 |
| ElastiCache Redis | cache.t3.medium | ~$50 |
| Application Load Balancer | Standard | ~$25 |
| ECR Storage | ~5GB images | ~$5 |
| CloudWatch Logs | ~10GB/month | ~$5 |
| Data Transfer | ~50GB/month | ~$15 |
| **Total** | | **~$320/month** |

### Cost Optimization Tips

1. **Use Fargate Spot**: Save up to 70% on compute
2. **Reserved Instances**: Save 30-40% on RDS/ElastiCache
3. **Right-size services**: Start small, scale as needed
4. **Use single RDS with schemas**: Instead of separate instances

---

## Troubleshooting

### Deployment Failures

```bash
# Check if image exists in ECR
aws ecr list-images --repository-name aiponge-api-gateway

# Check ECS service events
aws ecs describe-services \
  --cluster aiponge-cluster \
  --services aiponge-api-gateway \
  --query 'services[0].events[:5]'

# Check task stopped reason
aws ecs describe-tasks \
  --cluster aiponge-cluster \
  --tasks TASK_ARN \
  --query 'tasks[0].stoppedReason'
```

### Health Checks Failing

```bash
# Check target group health
aws elbv2 describe-target-health --target-group-arn arn:aws:...

# Check CloudWatch logs
aws logs get-log-events \
  --log-group-name /ecs/aiponge-api-gateway \
  --log-stream-name ecs/api-gateway/TASK_ID
```

### Database Connection Issues

```bash
# Test connectivity from ECS task
aws ecs execute-command \
  --cluster aiponge-cluster \
  --task TASK_ARN \
  --container api-gateway \
  --interactive \
  --command "/bin/sh"

# Inside container:
nc -zv DATABASE_HOST 5432
```

### S3 Access Issues

**"Access Denied" Error:**
- Verify IAM permissions
- Check bucket policy
- Confirm credentials match IAM user

**"Bucket Not Found":**
- Verify bucket name (case-sensitive)
- Check `AWS_REGION` matches bucket region

**CORS Errors:**
- Add app domains to CORS policy
- Include `exp://*` for Expo dev mode
- Clear browser cache

---

## Rollback Procedures

### Quick Rollback (Previous Version)

```bash
# List recent task definitions
aws ecs list-task-definitions \
  --family-prefix aiponge-api-gateway \
  --sort DESC \
  --max-items 5

# Rollback to previous version
aws ecs update-service \
  --cluster aiponge-cluster \
  --service aiponge-api-gateway \
  --task-definition aiponge-api-gateway:PREVIOUS_REVISION \
  --force-new-deployment
```

### Rollback All Services

```bash
#!/bin/bash
SERVICES=(
  "system-service"
  "storage-service"
  "user-service"
  "ai-config-service"
  "ai-content-service"
  "ai-analytics-service"
  "music-service"
  "api-gateway"
)

for SERVICE in "${SERVICES[@]}"; do
  CURRENT=$(aws ecs describe-services \
    --cluster aiponge-cluster \
    --services aiponge-$SERVICE \
    --query 'services[0].taskDefinition' \
    --output text | grep -oE '[0-9]+$')
  
  PREVIOUS=$((CURRENT - 1))
  
  echo "Rolling back $SERVICE from :$CURRENT to :$PREVIOUS"
  
  aws ecs update-service \
    --cluster aiponge-cluster \
    --service aiponge-$SERVICE \
    --task-definition aiponge-$SERVICE:$PREVIOUS \
    --force-new-deployment
done
```

### Database Rollback

```bash
# Point-in-time recovery
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier aiponge-db \
  --target-db-instance-identifier aiponge-db-restored \
  --restore-time 2024-01-15T10:00:00Z

# From snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier aiponge-db-restored \
  --db-snapshot-identifier $SNAPSHOT_ID
```

---

## Security Best Practices

1. **Never commit secrets** - Use AWS Secrets Manager
2. **Enable encryption** - RDS, ElastiCache, ECR, S3 all support encryption
3. **Use private subnets** - Only ALB should be public-facing
4. **Enable VPC Flow Logs** - For network monitoring
5. **Rotate credentials** - Use IAM roles where possible
6. **Enable MFA** - For AWS console access
7. **Review security groups** - Principle of least privilege
8. **Use signed URLs** - For private S3 content
9. **Enable S3 versioning** - For data recovery
10. **Monitor access patterns** - CloudTrail and S3 access logs

---

## File References

| File | Description |
|------|-------------|
| `deploy/aws/setup-ecr.sh` | ECR repository creation script |
| `deploy/aws/ecs-task-definition.json` | ECS task definition template |
| `deploy/aws/cloudfront-distribution.json` | CloudFront CDN configuration |
| `deploy/aws/iam-ecs-execution-role-policy.json` | IAM policy for task execution |
| `deploy/aws/iam-ecs-task-role-policy.json` | IAM policy for running tasks |
| `deploy/aws/task-definitions/` | Service-specific task definitions |
| `deploy/docker/Dockerfile.service` | Universal service Dockerfile |

---

## Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [AWS Pricing Calculator](https://calculator.aws/)

---

*Last Updated: December 2025*
