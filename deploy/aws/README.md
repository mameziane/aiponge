# AWS Infrastructure

This directory contains AWS deployment configuration files for the Aiponge platform.

## Documentation

See the comprehensive deployment guide: **[docs/AWS_DEPLOYMENT_GUIDE.md](../../docs/AWS_DEPLOYMENT_GUIDE.md)**

## Files

| File                                 | Description                                            |
| ------------------------------------ | ------------------------------------------------------ |
| `setup-ecr.sh`                       | Script to create ECR repositories for all services     |
| `ecs-task-definition.json`           | Main ECS task definition template                      |
| `cloudfront-distribution.json`       | CloudFront CDN distribution configuration              |
| `iam-ecs-execution-role-policy.json` | IAM policy for ECS task execution (ECR, logs, secrets) |
| `iam-ecs-task-role-policy.json`      | IAM policy for running ECS tasks (S3, metrics, SQS)    |
| `task-definitions/`                  | Service-specific ECS task definition templates         |

## Quick Start

1. Configure AWS CLI with appropriate credentials
2. Run `./setup-ecr.sh` to create ECR repositories
3. Follow the deployment guide for complete setup instructions
