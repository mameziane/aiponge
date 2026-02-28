TIER 1 (0-5K):     Deploy with defaults. Done.

TIER 2 (5K-50K):   FLAG_ASYNC_GENERATION=true
                    REDIS_CLUSTER_NODES=host1:6379,host2:6379

TIER 3 (50K-200K):  FLAG_CDN_CACHE_HEADERS=true
                    FLAG_STATIC_METADATA_ENDPOINTS=true
                    FLAG_ADMIN_USE_PRECOMPUTED=true
                    *_DATABASE_REPLICA_URL=<replica connection strings>
                    + Place CloudFront in front of API Gateway

TIER 4 (200K-500K+): MUSIC_DATABASE_URL=<dedicated instance>
                     AI_CONTENT_DATABASE_URL=<dedicated instance>
                     (repeat for all services)
                     EVENT_BUS_PROVIDER=kafka
                     STORAGE_PROVIDER=s3
                     + Deploy BullMQ workers as separate containers
