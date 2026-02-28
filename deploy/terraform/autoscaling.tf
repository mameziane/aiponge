resource "aws_appautoscaling_target" "api_gateway" {
  max_capacity       = var.api_gateway_max_capacity
  min_capacity       = var.api_gateway_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api_gateway.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_gateway_cpu" {
  name               = "${local.name_prefix}-api-gateway-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api_gateway.resource_id
  scalable_dimension = aws_appautoscaling_target.api_gateway.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api_gateway.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "api_gateway_memory" {
  name               = "${local.name_prefix}-api-gateway-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api_gateway.resource_id
  scalable_dimension = aws_appautoscaling_target.api_gateway.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api_gateway.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "system_service" {
  max_capacity       = var.system_service_max_capacity
  min_capacity       = var.system_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.system_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "system_service_cpu" {
  name               = "${local.name_prefix}-system-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.system_service.resource_id
  scalable_dimension = aws_appautoscaling_target.system_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.system_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "system_service_memory" {
  name               = "${local.name_prefix}-system-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.system_service.resource_id
  scalable_dimension = aws_appautoscaling_target.system_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.system_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "storage_service" {
  max_capacity       = var.storage_service_max_capacity
  min_capacity       = var.storage_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.storage_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "storage_service_cpu" {
  name               = "${local.name_prefix}-storage-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.storage_service.resource_id
  scalable_dimension = aws_appautoscaling_target.storage_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.storage_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "storage_service_memory" {
  name               = "${local.name_prefix}-storage-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.storage_service.resource_id
  scalable_dimension = aws_appautoscaling_target.storage_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.storage_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "user_service" {
  max_capacity       = var.user_service_max_capacity
  min_capacity       = var.user_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.user_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "user_service_cpu" {
  name               = "${local.name_prefix}-user-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.user_service.resource_id
  scalable_dimension = aws_appautoscaling_target.user_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.user_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "user_service_memory" {
  name               = "${local.name_prefix}-user-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.user_service.resource_id
  scalable_dimension = aws_appautoscaling_target.user_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.user_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "ai_config_service" {
  max_capacity       = var.ai_config_service_max_capacity
  min_capacity       = var.ai_config_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.ai_config_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ai_config_service_cpu" {
  name               = "${local.name_prefix}-ai-config-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_config_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_config_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_config_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "ai_config_service_memory" {
  name               = "${local.name_prefix}-ai-config-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_config_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_config_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_config_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "ai_content_service" {
  max_capacity       = var.ai_content_service_max_capacity
  min_capacity       = var.ai_content_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.ai_content_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ai_content_service_cpu" {
  name               = "${local.name_prefix}-ai-content-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_content_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_content_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_content_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "ai_content_service_memory" {
  name               = "${local.name_prefix}-ai-content-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_content_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_content_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_content_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "ai_analytics_service" {
  max_capacity       = var.ai_analytics_service_max_capacity
  min_capacity       = var.ai_analytics_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.ai_analytics_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ai_analytics_service_cpu" {
  name               = "${local.name_prefix}-ai-analytics-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_analytics_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_analytics_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_analytics_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "ai_analytics_service_memory" {
  name               = "${local.name_prefix}-ai-analytics-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_analytics_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_analytics_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_analytics_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "music_service" {
  max_capacity       = var.music_service_max_capacity
  min_capacity       = var.music_service_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.music_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "music_service_cpu" {
  name               = "${local.name_prefix}-music-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.music_service.resource_id
  scalable_dimension = aws_appautoscaling_target.music_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.music_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "music_service_memory" {
  name               = "${local.name_prefix}-music-service-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.music_service.resource_id
  scalable_dimension = aws_appautoscaling_target.music_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.music_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
