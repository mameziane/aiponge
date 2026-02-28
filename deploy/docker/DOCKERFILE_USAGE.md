# Enhanced Dockerfile Template Usage Guide

## Overview

The enhanced `Dockerfile.service` template provides a comprehensive, secure, and parameterized foundation for all microservices in the project. It incorporates enterprise-grade security practices while maintaining flexibility through build arguments.

## Key Features

### Security Hardening
- **Multi-stage build**: Separates build and runtime environments
- **Non-root user execution**: All processes run as unprivileged user
- **Minimal attack surface**: Alpine Linux base with only essential packages
- **Tini init system**: Proper signal handling and zombie process reaping
- **Security updates**: Latest packages with vulnerability patches
- **File permissions**: Proper ownership and restricted access

### Performance Optimization
- **BuildKit cache mounts**: Faster npm installs with persistent cache
- **Production-only runtime**: Dev dependencies excluded from final image
- **Minimal base image**: Smaller image size and faster deployments

### Configurability
- **Parameterized ports**: Custom service ports via build args
- **Dynamic health checks**: Configurable health check endpoints
- **Custom user names**: Service-specific user configurations
- **Flexible start commands**: Override default startup behavior

## Build Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `NODE_VERSION` | `20.17-alpine` | Node.js version and base image |
| `SERVICE_PORT` | `3001` | Port the service listens on |
| `HEALTHCHECK_PATH` | `/health` | Health check endpoint path |
| `USER_NAME` | `app` | Non-root user name for the service |
| `START_CMD` | `"npm start"` | Command to start the service |

## Usage Examples

### Basic Usage (Default Configuration)
```bash
# Uses all default values
docker build -f deploy/docker/Dockerfile.service -t my-service .
```

### API Gateway Configuration
```bash
# Replaces packages/services/api-gateway/Dockerfile
docker build \
  --build-arg SERVICE_PORT=8080 \
  --build-arg USER_NAME=gateway \
  --build-arg HEALTHCHECK_PATH=/api/health \
  -f deploy/docker/Dockerfile.service \
  -t api-gateway \
  packages/services/api-gateway/
```

### System Service Configuration
```bash
# Replaces packages/services/system-service/Dockerfile
docker build \
  --build-arg SERVICE_PORT=8081 \
  --build-arg USER_NAME=discovery \
  --build-arg HEALTHCHECK_PATH=/system/health \
  -f deploy/docker/Dockerfile.service \
  -t system-service \
  packages/services/system-service/
```

### Custom Service Configuration
```bash
# Custom configuration for specialized services
docker build \
  --build-arg SERVICE_PORT=9000 \
  --build-arg USER_NAME=worker \
  --build-arg START_CMD="node dist/worker.js" \
  --build-arg HEALTHCHECK_PATH="/status" \
  -f deploy/docker/Dockerfile.service \
  -t custom-worker .
```

## Runtime Environment Variables

You can override configuration at runtime without rebuilding:

```bash
# Override port and health check path at runtime
docker run \
  -e SERVICE_PORT=9000 \
  -e HEALTHCHECK_PATH=/api/status \
  -p 9000:9000 \
  my-service
```

## Migration from Existing Dockerfiles

### Before (Individual Dockerfiles)
Each service had its own Dockerfile with duplicated security and build logic:
- `packages/services/api-gateway/Dockerfile`
- `packages/services/system-service/Dockerfile`

### After (Shared Template)
All services use the same secure, optimized template with service-specific parameters:

```bash
# In docker-compose.yml or CI/CD
services:
  api-gateway:
    build:
      context: packages/services/api-gateway
      dockerfile: ../../deploy/docker/Dockerfile.service
      args:
        SERVICE_PORT: 8080
        USER_NAME: gateway
        
  system-service:
    build:
      context: packages/services/system-service
      dockerfile: ../../deploy/docker/Dockerfile.service
      args:
        SERVICE_PORT: 8081
        USER_NAME: discovery
```

## Security Benefits

1. **Consistent Security**: All services inherit the same security hardening
2. **Non-root Execution**: Reduces privilege escalation risks
3. **Minimal Attack Surface**: Only essential packages installed
4. **Process Management**: Proper init system prevents zombie processes
5. **File System Security**: Appropriate permissions and ownership
6. **Build-time Security**: Dev dependencies not included in runtime image

## Performance Benefits

1. **Layer Caching**: BuildKit cache mounts speed up builds
2. **Multi-stage Optimization**: Smaller runtime images
3. **Dependency Optimization**: Production-only packages in final image
4. **Faster Deployments**: Smaller image sizes reduce transfer time

## Best Practices

1. **Use specific Node versions**: Pin to specific LTS versions for consistency
2. **Configure health checks**: Ensure proper health check endpoints exist
3. **Set appropriate timeouts**: Configure health check timing for your service
4. **Use semantic versioning**: Tag images with meaningful version numbers
5. **Monitor resource usage**: Adjust health check intervals based on service characteristics

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure source files are readable by Docker build context
2. **Health Check Failures**: Verify the health check endpoint exists and responds correctly
3. **Build Failures**: Check that all required files are in the build context

### Debugging

```bash
# Build with debug output
docker build --progress=plain -f deploy/docker/Dockerfile.service .

# Run with interactive shell for debugging
docker run --rm -it --entrypoint /bin/sh my-service

# Check running processes
docker exec -it <container> ps aux
```

This enhanced template significantly improves security, maintainability, and consistency across all microservices while providing the flexibility needed for different service requirements.