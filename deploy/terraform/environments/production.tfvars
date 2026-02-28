environment = "production"
project_name = "aiponge"
aws_region = "us-east-1"

vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

ecs_cluster_name = "aiponge-cluster"

image_tag = "latest"

api_gateway_cpu           = 1024
api_gateway_memory        = 2048
api_gateway_desired_count = 3
api_gateway_min_capacity  = 2
api_gateway_max_capacity  = 10

system_service_cpu           = 512
system_service_memory        = 1024
system_service_desired_count = 2
system_service_min_capacity  = 2
system_service_max_capacity  = 6

storage_service_cpu           = 512
storage_service_memory        = 1024
storage_service_desired_count = 2
storage_service_min_capacity  = 2
storage_service_max_capacity  = 8

user_service_cpu           = 1024
user_service_memory        = 2048
user_service_desired_count = 3
user_service_min_capacity  = 2
user_service_max_capacity  = 10

ai_config_service_cpu           = 512
ai_config_service_memory        = 1024
ai_config_service_desired_count = 2
ai_config_service_min_capacity  = 2
ai_config_service_max_capacity  = 6

ai_content_service_cpu           = 1024
ai_content_service_memory        = 2048
ai_content_service_desired_count = 3
ai_content_service_min_capacity  = 2
ai_content_service_max_capacity  = 10

ai_analytics_service_cpu           = 512
ai_analytics_service_memory        = 1024
ai_analytics_service_desired_count = 2
ai_analytics_service_min_capacity  = 2
ai_analytics_service_max_capacity  = 8

music_service_cpu           = 1024
music_service_memory        = 2048
music_service_desired_count = 3
music_service_min_capacity  = 2
music_service_max_capacity  = 10

db_instance_class    = "db.r6g.large"
db_allocated_storage = 100
db_multi_az          = true

redis_node_type       = "cache.r6g.large"
redis_num_cache_nodes = 2

alarm_sns_email = "ops@aiponge.com"
