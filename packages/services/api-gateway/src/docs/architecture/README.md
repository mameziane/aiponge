# API Gateway Architecture

## Overview

The aiponge API Gateway implements a Clean Architecture pattern with microservices integration, providing a centralized entry point for all client-server communications.

## Architecture Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Client Apps    │    │   API Gateway    │    │  Microservices  │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │   Admin     │ │───▶│ │ Rate Limiter │ │    │ │ User Service│ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │   Member    │ │───▶│ │ CORS Handler │ │───▶│ │ AI Service  │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │   ...       │ │───▶│ │ Auth Validator│ │    │ │Music Service│ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │       ...       │
│ │   ...       │ │───▶│ │ Load Balancer│ │    │                 │
│ └─────────────┘ │    │ └──────────────┘ │    │                 │
└─────────────────┘    │ ┌──────────────┐ │    │                 │
                       │ │ Circuit Break│ │    │                 │
                       │ └──────────────┘ │    │                 │
                       └──────────────────┘    └─────────────────┘
```

## Core Components

### 1. Gateway Core (`GatewayCore`)
- **Purpose**: Central orchestration and request processing
- **Components**: 
  - Service Discovery
  - Load Balancer
  - Reverse Proxy
  - API Versioning

### 2. Middleware Layer
- **Rate Limiting**: Protects services from abuse
- **CORS**: Cross-origin request handling
- **Authentication**: JWT validation
- **Error Handling**: Standardized error responses
- **Logging**: Request/response tracking
- **Metrics**: Performance monitoring

### 3. Route Management (`GatewayRoutes`)
- **Health Routes**: Service health monitoring
- **Proxy Routes**: Dynamic service routing
- **Auth Routes**: Authentication endpoints
- **GraphQL Routes**: GraphQL proxy support

### 4. Service Layer
- **Service Discovery**: Auto-discovery of microservices
- **Circuit Breaker**: Fault tolerance
- **Load Balancer**: Request distribution
- **Reverse Proxy**: Request forwarding

## Request Flow

1. **Client Request** → API Gateway
2. **Middleware Processing**:
   - Rate limiting check
   - CORS validation
   - Authentication verification
   - Request logging
3. **Route Resolution**:
   - Path pattern matching
   - Service discovery
   - Load balancing
4. **Service Communication**:
   - Circuit breaker check
   - Request proxying
   - Response handling
5. **Response Processing**:
   - Error handling
   - Response transformation
   - Metrics collection
6. **Client Response** ← API Gateway

## Configuration Management

### Environment-Based Configuration
- **Service URLs**: Dynamic based on environment variables
- **CORS Origins**: Configurable per environment
- **Rate Limits**: Adjustable per deployment
- **Circuit Breaker**: Configurable thresholds

### Dynamic Service Registry
- **Auto-Discovery**: Services register via environment
- **Health Monitoring**: Continuous health checks
- **Failover**: Automatic unhealthy service exclusion

## Error Handling Strategy

### Circuit Breaker Pattern
- **Closed**: Normal operation
- **Open**: Service failure detected, requests fail fast
- **Half-Open**: Testing service recovery

### Retry Logic
- **Exponential Backoff**: Increasing delays between retries
- **Max Attempts**: Configurable retry limits
- **Timeout Handling**: Request timeout management

## Security Architecture

### Authentication Flow
1. Client sends JWT token in Authorization header
2. Gateway validates token signature and expiry
3. User information extracted and forwarded to services
4. Service-specific authorization handled by target service

### Rate Limiting Strategy
- **IP-based**: Per-IP request limits
- **User-based**: Per-user limits for authenticated requests
- **Endpoint-specific**: Different limits per API endpoint

## Monitoring & Observability

### Health Monitoring
- **Gateway Health**: Internal health checks
- **Service Health**: Downstream service monitoring
- **Aggregate Status**: Overall system health

### Metrics Collection
- **Request Count**: Total requests processed
- **Response Time**: Request processing latency
- **Error Rate**: Failed request percentage
- **Service Availability**: Uptime monitoring

### Logging Strategy
- **Structured Logs**: JSON format for parsing
- **Request Tracing**: Unique request IDs
- **Error Logging**: Detailed error information
- **Performance Logs**: Timing and metrics

## Deployment Architecture

### Container Strategy
- **Docker**: Containerized deployment
- **Multi-stage Build**: Optimized image size
- **Health Checks**: Container health monitoring
- **Graceful Shutdown**: Proper connection cleanup

### Scalability
- **Horizontal Scaling**: Multiple gateway instances
- **Load Balancing**: External load balancer
- **Service Mesh**: Future Istio integration
- **Auto-scaling**: Based on metrics