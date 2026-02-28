environment = "staging"
project_name = "aiponge"
aws_region = "us-east-1"

vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]

ecs_cluster_name = "aiponge-cluster"

image_tag = "latest"

api_gateway_cpu           = 256
api_gateway_memory        = 512
api_gateway_desired_count = 1
api_gateway_min_capacity  = 1
api_gateway_max_capacity  = 3

system_service_cpu           = 256
system_service_memory        = 512
system_service_desired_count = 1
system_service_min_capacity  = 1
system_service_max_capacity  = 3

storage_service_cpu           = 256
storage_service_memory        = 512
storage_service_desired_count = 1
storage_service_min_capacity  = 1
storage_service_max_capacity  = 3

user_service_cpu           = 256
user_service_memory        = 512
user_service_desired_count = 1
user_service_min_capacity  = 1
user_service_max_capacity  = 3

ai_config_service_cpu           = 256
ai_config_service_memory        = 512
ai_config_service_desired_count = 1
ai_config_service_min_capacity  = 1
ai_config_service_max_capacity  = 3

ai_content_service_cpu           = 256
ai_content_service_memory        = 512
ai_content_service_desired_count = 1
ai_content_service_min_capacity  = 1
ai_content_service_max_capacity  = 3

ai_analytics_service_cpu           = 256
ai_analytics_service_memory        = 512
ai_analytics_service_desired_count = 1
ai_analytics_service_min_capacity  = 1
ai_analytics_service_max_capacity  = 3

music_service_cpu           = 256
music_service_memory        = 512
music_service_desired_count = 1
music_service_min_capacity  = 1
music_service_max_capacity  = 3

db_instance_class    = "db.t3.small"
db_allocated_storage = 20
db_multi_az          = false

redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

alarm_sns_email = "ops@aiponge.com"
