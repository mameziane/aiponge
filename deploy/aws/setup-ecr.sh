#!/bin/bash
# ECR Repository Setup Script for Aiponge
# Run this once to create all ECR repositories

set -e

AWS_REGION="${AWS_REGION:-us-east-1}"

echo "🚀 Creating ECR repositories in $AWS_REGION..."

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
  echo "Creating repository: $SERVICE"
  
  if aws ecr describe-repositories --repository-names "$SERVICE" --region "$AWS_REGION" 2>/dev/null; then
    echo "  ⏭️  Repository already exists: $SERVICE"
  else
    aws ecr create-repository \
      --repository-name "$SERVICE" \
      --region "$AWS_REGION" \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 \
      --image-tag-mutability MUTABLE
    
    # Set lifecycle policy to clean up old images
    aws ecr put-lifecycle-policy \
      --repository-name "$SERVICE" \
      --region "$AWS_REGION" \
      --lifecycle-policy-text '{
        "rules": [
          {
            "rulePriority": 1,
            "description": "Keep last 10 images",
            "selection": {
              "tagStatus": "any",
              "countType": "imageCountMoreThan",
              "countNumber": 10
            },
            "action": {
              "type": "expire"
            }
          }
        ]
      }'
    
    echo "  ✅ Created: $SERVICE"
  fi
done

echo ""
echo "✅ ECR setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Add these secrets to GitHub:"
echo "   - AWS_ACCOUNT_ID: $(aws sts get-caller-identity --query Account --output text)"
echo "   - AWS_ACCESS_KEY_ID: (create IAM user for CI/CD)"
echo "   - AWS_SECRET_ACCESS_KEY: (create IAM user for CI/CD)"
echo ""
echo "2. Push code to trigger CI/CD pipeline"
