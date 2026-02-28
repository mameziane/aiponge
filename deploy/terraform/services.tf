# =============================================================================
# AWS Secrets Manager - Centralized secret storage for ECS services
# =============================================================================

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${local.name_prefix}/database-url"
  description = "PostgreSQL connection string for all services"

  tags = {
    Name        = "${local.name_prefix}-database-url"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${aws_db_instance.main.username}:${aws_db_instance.main.password}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${local.name_prefix}/jwt-secret"
  description = "JWT signing secret for authentication"

  tags = {
    Name        = "${local.name_prefix}-jwt-secret"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "internal_service_secret" {
  name        = "${local.name_prefix}/internal-service-secret"
  description = "Internal service-to-service authentication secret"

  tags = {
    Name        = "${local.name_prefix}-internal-service-secret"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "internal_service_secret" {
  secret_id     = aws_secretsmanager_secret.internal_service_secret.id
  secret_string = var.internal_service_secret
}

resource "aws_secretsmanager_secret" "entry_encryption_key" {
  name        = "${local.name_prefix}/entry-encryption-key"
  description = "AES-256-GCM encryption key for sensitive user data"

  tags = {
    Name        = "${local.name_prefix}-entry-encryption-key"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "entry_encryption_key" {
  secret_id     = aws_secretsmanager_secret.entry_encryption_key.id
  secret_string = var.entry_encryption_key
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name        = "${local.name_prefix}/openai-api-key"
  description = "OpenAI API key for AI content generation"

  tags = {
    Name        = "${local.name_prefix}-openai-api-key"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = var.openai_api_key
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "${local.name_prefix}/anthropic-api-key"
  description = "Anthropic API key for AI content generation"

  tags = {
    Name        = "${local.name_prefix}-anthropic-api-key"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = var.anthropic_api_key
}

resource "aws_secretsmanager_secret" "elevenlabs_api_key" {
  name        = "${local.name_prefix}/elevenlabs-api-key"
  description = "ElevenLabs API key for voice synthesis"

  tags = {
    Name        = "${local.name_prefix}-elevenlabs-api-key"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "elevenlabs_api_key" {
  secret_id     = aws_secretsmanager_secret.elevenlabs_api_key.id
  secret_string = var.elevenlabs_api_key
}

resource "aws_secretsmanager_secret" "musicapi_api_key" {
  name        = "${local.name_prefix}/musicapi-api-key"
  description = "MusicAPI.ai key for music generation"

  tags = {
    Name        = "${local.name_prefix}-musicapi-api-key"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "musicapi_api_key" {
  secret_id     = aws_secretsmanager_secret.musicapi_api_key.id
  secret_string = var.musicapi_api_key
}

resource "aws_secretsmanager_secret" "aws_access_key_id" {
  name        = "${local.name_prefix}/aws-access-key-id"
  description = "AWS access key for S3 storage"

  tags = {
    Name        = "${local.name_prefix}-aws-access-key-id"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "aws_access_key_id" {
  secret_id     = aws_secretsmanager_secret.aws_access_key_id.id
  secret_string = var.s3_access_key_id
}

resource "aws_secretsmanager_secret" "aws_secret_access_key" {
  name        = "${local.name_prefix}/aws-secret-access-key"
  description = "AWS secret key for S3 storage"

  tags = {
    Name        = "${local.name_prefix}-aws-secret-access-key"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "aws_secret_access_key" {
  secret_id     = aws_secretsmanager_secret.aws_secret_access_key.id
  secret_string = var.s3_secret_access_key
}

resource "aws_lb_target_group" "services" {
  for_each = local.services

  name        = "${local.name_prefix}-${each.key}"
  port        = each.value.port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 10
    interval            = 30
    path                = "/health/ready"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name    = "${local.name_prefix}-${each.key}-tg"
    Service = each.key
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener_rule" "api_gateway" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["api-gateway"].arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/health/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-api-gateway-rule"
    Service = "api-gateway"
  }
}

resource "aws_lb_listener_rule" "system_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["system-service"].arn
  }

  condition {
    path_pattern {
      values = ["/system/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-system-service-rule"
    Service = "system-service"
  }
}

resource "aws_lb_listener_rule" "storage_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["storage-service"].arn
  }

  condition {
    path_pattern {
      values = ["/storage/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-storage-service-rule"
    Service = "storage-service"
  }
}

resource "aws_lb_listener_rule" "user_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["user-service"].arn
  }

  condition {
    path_pattern {
      values = ["/users/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-user-service-rule"
    Service = "user-service"
  }
}

resource "aws_lb_listener_rule" "ai_config_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["ai-config-service"].arn
  }

  condition {
    path_pattern {
      values = ["/ai-config/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-ai-config-service-rule"
    Service = "ai-config-service"
  }
}

resource "aws_lb_listener_rule" "ai_content_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["ai-content-service"].arn
  }

  condition {
    path_pattern {
      values = ["/ai-content/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-ai-content-service-rule"
    Service = "ai-content-service"
  }
}

resource "aws_lb_listener_rule" "ai_analytics_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 60

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["ai-analytics-service"].arn
  }

  condition {
    path_pattern {
      values = ["/ai-analytics/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-ai-analytics-service-rule"
    Service = "ai-analytics-service"
  }
}

resource "aws_lb_listener_rule" "music_service" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 70

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["music-service"].arn
  }

  condition {
    path_pattern {
      values = ["/music/*"]
    }
  }

  tags = {
    Name    = "${local.name_prefix}-music-service-rule"
    Service = "music-service"
  }
}

resource "aws_ecs_task_definition" "api_gateway" {
  family                   = "${local.name_prefix}-api-gateway"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_gateway_cpu
  memory                   = var.api_gateway_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api-gateway"
      image     = "${var.ecr_registry}/${var.project_name}-api-gateway:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "api-gateway" },
        { name = "PORT", value = "8080" },
        { name = "SYSTEM_SERVICE_URL", value = "http://system-service.${local.name_prefix}.local:3001" },
        { name = "STORAGE_SERVICE_URL", value = "http://storage-service.${local.name_prefix}.local:3002" },
        { name = "USER_SERVICE_URL", value = "http://user-service.${local.name_prefix}.local:3003" },
        { name = "AI_CONFIG_SERVICE_URL", value = "http://ai-config-service.${local.name_prefix}.local:3004" },
        { name = "AI_CONTENT_SERVICE_URL", value = "http://ai-content-service.${local.name_prefix}.local:3005" },
        { name = "AI_ANALYTICS_SERVICE_URL", value = "http://ai-analytics-service.${local.name_prefix}.local:3006" },
        { name = "MUSIC_SERVICE_URL", value = "http://music-service.${local.name_prefix}.local:3007" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
      ]

      secrets = [
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "INTERNAL_SERVICE_SECRET", valueFrom = aws_secretsmanager_secret.internal_service_secret.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["api-gateway"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-api-gateway-task"
    Service = "api-gateway"
  }
}

resource "aws_ecs_service" "api_gateway" {
  name            = "${local.name_prefix}-api-gateway"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api_gateway.arn
  desired_count   = var.api_gateway_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["api-gateway"].arn
    container_name   = "api-gateway"
    container_port   = 8080
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["api-gateway"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-api-gateway-service"
    Service = "api-gateway"
  }

  depends_on = [aws_lb_listener_rule.api_gateway]
}

resource "aws_ecs_task_definition" "system_service" {
  family                   = "${local.name_prefix}-system-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.system_service_cpu
  memory                   = var.system_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "system-service"
      image     = "${var.ecr_registry}/${var.project_name}-system-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3001
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "system-service" },
        { name = "PORT", value = "3001" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DATABASE_POOL_MAX", value = "50" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "INTERNAL_SERVICE_SECRET", valueFrom = aws_secretsmanager_secret.internal_service_secret.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["system-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3001/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-system-service-task"
    Service = "system-service"
  }
}

resource "aws_ecs_service" "system_service" {
  name            = "${local.name_prefix}-system-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.system_service.arn
  desired_count   = var.system_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["system-service"].arn
    container_name   = "system-service"
    container_port   = 3001
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["system-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-system-service"
    Service = "system-service"
  }

  depends_on = [aws_lb_listener_rule.system_service]
}

resource "aws_ecs_task_definition" "storage_service" {
  family                   = "${local.name_prefix}-storage-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.storage_service_cpu
  memory                   = var.storage_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "storage-service"
      image     = "${var.ecr_registry}/${var.project_name}-storage-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3002
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "storage-service" },
        { name = "PORT", value = "3002" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "STORAGE_PROVIDER", value = "s3" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "DATABASE_POOL_MAX", value = "50" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "AWS_ACCESS_KEY_ID", valueFrom = aws_secretsmanager_secret.aws_access_key_id.arn },
        { name = "AWS_SECRET_ACCESS_KEY", valueFrom = aws_secretsmanager_secret.aws_secret_access_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["storage-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3002/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-storage-service-task"
    Service = "storage-service"
  }
}

resource "aws_ecs_service" "storage_service" {
  name            = "${local.name_prefix}-storage-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.storage_service.arn
  desired_count   = var.storage_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["storage-service"].arn
    container_name   = "storage-service"
    container_port   = 3002
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["storage-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-storage-service"
    Service = "storage-service"
  }

  depends_on = [aws_lb_listener_rule.storage_service]
}

resource "aws_ecs_task_definition" "user_service" {
  family                   = "${local.name_prefix}-user-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.user_service_cpu
  memory                   = var.user_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "user-service"
      image     = "${var.ecr_registry}/${var.project_name}-user-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3003
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "user-service" },
        { name = "PORT", value = "3003" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DATABASE_POOL_MAX", value = "50" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "INTERNAL_SERVICE_SECRET", valueFrom = aws_secretsmanager_secret.internal_service_secret.arn },
        { name = "ENTRY_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.entry_encryption_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["user-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3003/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-user-service-task"
    Service = "user-service"
  }
}

resource "aws_ecs_service" "user_service" {
  name            = "${local.name_prefix}-user-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.user_service.arn
  desired_count   = var.user_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["user-service"].arn
    container_name   = "user-service"
    container_port   = 3003
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["user-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-user-service"
    Service = "user-service"
  }

  depends_on = [aws_lb_listener_rule.user_service]
}

resource "aws_ecs_task_definition" "ai_config_service" {
  family                   = "${local.name_prefix}-ai-config-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ai_config_service_cpu
  memory                   = var.ai_config_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "ai-config-service"
      image     = "${var.ecr_registry}/${var.project_name}-ai-config-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3004
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "ai-config-service" },
        { name = "PORT", value = "3004" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DATABASE_POOL_MAX", value = "50" },
        { name = "CACHE_TTL_DEFAULT", value = "300" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_api_key.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["ai-config-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3004/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-ai-config-service-task"
    Service = "ai-config-service"
  }
}

resource "aws_ecs_service" "ai_config_service" {
  name            = "${local.name_prefix}-ai-config-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_config_service.arn
  desired_count   = var.ai_config_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["ai-config-service"].arn
    container_name   = "ai-config-service"
    container_port   = 3004
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["ai-config-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-ai-config-service"
    Service = "ai-config-service"
  }

  depends_on = [aws_lb_listener_rule.ai_config_service]
}

resource "aws_ecs_task_definition" "ai_content_service" {
  family                   = "${local.name_prefix}-ai-content-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ai_content_service_cpu
  memory                   = var.ai_content_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "ai-content-service"
      image     = "${var.ecr_registry}/${var.project_name}-ai-content-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3005
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "ai-content-service" },
        { name = "PORT", value = "3005" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DATABASE_POOL_MAX", value = "50" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_api_key.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["ai-content-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3005/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-ai-content-service-task"
    Service = "ai-content-service"
  }
}

resource "aws_ecs_service" "ai_content_service" {
  name            = "${local.name_prefix}-ai-content-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_content_service.arn
  desired_count   = var.ai_content_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["ai-content-service"].arn
    container_name   = "ai-content-service"
    container_port   = 3005
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["ai-content-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-ai-content-service"
    Service = "ai-content-service"
  }

  depends_on = [aws_lb_listener_rule.ai_content_service]
}

resource "aws_ecs_task_definition" "ai_analytics_service" {
  family                   = "${local.name_prefix}-ai-analytics-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ai_analytics_service_cpu
  memory                   = var.ai_analytics_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "ai-analytics-service"
      image     = "${var.ecr_registry}/${var.project_name}-ai-analytics-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3006
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "ai-analytics-service" },
        { name = "PORT", value = "3006" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DATABASE_POOL_MAX", value = "50" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["ai-analytics-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3006/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-ai-analytics-service-task"
    Service = "ai-analytics-service"
  }
}

resource "aws_ecs_service" "ai_analytics_service" {
  name            = "${local.name_prefix}-ai-analytics-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_analytics_service.arn
  desired_count   = var.ai_analytics_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["ai-analytics-service"].arn
    container_name   = "ai-analytics-service"
    container_port   = 3006
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["ai-analytics-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-ai-analytics-service"
    Service = "ai-analytics-service"
  }

  depends_on = [aws_lb_listener_rule.ai_analytics_service]
}

resource "aws_ecs_task_definition" "music_service" {
  family                   = "${local.name_prefix}-music-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.music_service_cpu
  memory                   = var.music_service_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "music-service"
      image     = "${var.ecr_registry}/${var.project_name}-music-service:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3007
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "SERVICE_NAME", value = "music-service" },
        { name = "PORT", value = "3007" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DATABASE_POOL_MAX", value = "50" },
        { name = "QUEUE_WORKER_CONCURRENCY", value = "5" },
        { name = "CACHE_TTL_DEFAULT", value = "300" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "MUSICAPI_API_KEY", valueFrom = aws_secretsmanager_secret.musicapi_api_key.arn },
        { name = "ELEVENLABS_API_KEY", valueFrom = aws_secretsmanager_secret.elevenlabs_api_key.arn },
        { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_api_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs["music-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3007/health/ready || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 40
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-music-service-task"
    Service = "music-service"
  }
}

resource "aws_ecs_service" "music_service" {
  name            = "${local.name_prefix}-music-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.music_service.arn
  desired_count   = var.music_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["music-service"].arn
    container_name   = "music-service"
    container_port   = 3007
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["music-service"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${local.name_prefix}-music-service"
    Service = "music-service"
  }

  depends_on = [aws_lb_listener_rule.music_service]
}
