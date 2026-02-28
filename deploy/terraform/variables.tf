terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "aiponge-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "aiponge-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "aiponge"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "aiponge-cluster"
}

variable "ecr_registry" {
  description = "ECR registry URL (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "api_gateway_cpu" {
  description = "CPU units for api-gateway task"
  type        = number
  default     = 512
}

variable "api_gateway_memory" {
  description = "Memory (MiB) for api-gateway task"
  type        = number
  default     = 1024
}

variable "api_gateway_desired_count" {
  description = "Desired number of api-gateway tasks"
  type        = number
  default     = 2
}

variable "api_gateway_min_capacity" {
  description = "Minimum number of api-gateway tasks for autoscaling"
  type        = number
  default     = 1
}

variable "api_gateway_max_capacity" {
  description = "Maximum number of api-gateway tasks for autoscaling"
  type        = number
  default     = 5
}

variable "system_service_cpu" {
  description = "CPU units for system-service task"
  type        = number
  default     = 256
}

variable "system_service_memory" {
  description = "Memory (MiB) for system-service task"
  type        = number
  default     = 512
}

variable "system_service_desired_count" {
  description = "Desired number of system-service tasks"
  type        = number
  default     = 2
}

variable "system_service_min_capacity" {
  description = "Minimum number of system-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "system_service_max_capacity" {
  description = "Maximum number of system-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "storage_service_cpu" {
  description = "CPU units for storage-service task"
  type        = number
  default     = 256
}

variable "storage_service_memory" {
  description = "Memory (MiB) for storage-service task"
  type        = number
  default     = 512
}

variable "storage_service_desired_count" {
  description = "Desired number of storage-service tasks"
  type        = number
  default     = 2
}

variable "storage_service_min_capacity" {
  description = "Minimum number of storage-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "storage_service_max_capacity" {
  description = "Maximum number of storage-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "user_service_cpu" {
  description = "CPU units for user-service task"
  type        = number
  default     = 512
}

variable "user_service_memory" {
  description = "Memory (MiB) for user-service task"
  type        = number
  default     = 1024
}

variable "user_service_desired_count" {
  description = "Desired number of user-service tasks"
  type        = number
  default     = 2
}

variable "user_service_min_capacity" {
  description = "Minimum number of user-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "user_service_max_capacity" {
  description = "Maximum number of user-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "ai_config_service_cpu" {
  description = "CPU units for ai-config-service task"
  type        = number
  default     = 256
}

variable "ai_config_service_memory" {
  description = "Memory (MiB) for ai-config-service task"
  type        = number
  default     = 512
}

variable "ai_config_service_desired_count" {
  description = "Desired number of ai-config-service tasks"
  type        = number
  default     = 2
}

variable "ai_config_service_min_capacity" {
  description = "Minimum number of ai-config-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "ai_config_service_max_capacity" {
  description = "Maximum number of ai-config-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "ai_content_service_cpu" {
  description = "CPU units for ai-content-service task"
  type        = number
  default     = 512
}

variable "ai_content_service_memory" {
  description = "Memory (MiB) for ai-content-service task"
  type        = number
  default     = 1024
}

variable "ai_content_service_desired_count" {
  description = "Desired number of ai-content-service tasks"
  type        = number
  default     = 2
}

variable "ai_content_service_min_capacity" {
  description = "Minimum number of ai-content-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "ai_content_service_max_capacity" {
  description = "Maximum number of ai-content-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "ai_analytics_service_cpu" {
  description = "CPU units for ai-analytics-service task"
  type        = number
  default     = 256
}

variable "ai_analytics_service_memory" {
  description = "Memory (MiB) for ai-analytics-service task"
  type        = number
  default     = 512
}

variable "ai_analytics_service_desired_count" {
  description = "Desired number of ai-analytics-service tasks"
  type        = number
  default     = 2
}

variable "ai_analytics_service_min_capacity" {
  description = "Minimum number of ai-analytics-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "ai_analytics_service_max_capacity" {
  description = "Maximum number of ai-analytics-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "music_service_cpu" {
  description = "CPU units for music-service task"
  type        = number
  default     = 512
}

variable "music_service_memory" {
  description = "Memory (MiB) for music-service task"
  type        = number
  default     = 1024
}

variable "music_service_desired_count" {
  description = "Desired number of music-service tasks"
  type        = number
  default     = 2
}

variable "music_service_min_capacity" {
  description = "Minimum number of music-service tasks for autoscaling"
  type        = number
  default     = 1
}

variable "music_service_max_capacity" {
  description = "Maximum number of music-service tasks for autoscaling"
  type        = number
  default     = 5
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.small"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS in GB"
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of ElastiCache Redis cache nodes"
  type        = number
  default     = 1
}

variable "alarm_sns_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
  default     = ""
}
