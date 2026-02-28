# API Gateway Documentation

## Overview

The aiponge API Gateway serves as the central entry point for all microservice communications, providing routing, authentication, rate limiting, and monitoring capabilities.

## Base URL

```
Production: https://api.aiponge.com
Development: http://localhost:${API_GATEWAY_PORT:-8080}
```

> **Note**: The development port can be configured via the `API_GATEWAY_PORT` environment variable (defaults to 8080).

## Core Endpoints

### Health Check

**GET /health**

Returns the health status of the API Gateway and connected services.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "uptime": 123456,
  "services": {
    "user-service": { "status": "healthy", "responseTime": 45 },
    "ai-config-service": { "status": "healthy", "responseTime": 95 },
    "ai-content-service": { "status": "healthy", "responseTime": 110 },
    "ai-analytics-service": { "status": "healthy", "responseTime": 85 },
    "music-service": { "status": "healthy", "responseTime": 67 }
  }
}
```

### Service Health

**GET /api/health/services**

Returns detailed health information for all registered services.

### Proxy Routes

All API requests are proxied to appropriate microservices:

- `/api/users/*` → User Profile Service
- `/api/ai/providers/*` → AI Providers Service
- `/api/ai/templates/*` → AI Template Service
- `/api/ai/content/*` → AI Content Service
- `/api/ai/analytics/*` → AI Analytics Service
- `/api/content/*` → AI Content Service
- `/api/generate/*` → AI Content Service
- `/api/insights/*` → AI Analytics Service
- `/api/analytics/*` → AI Analytics Service
- `/api/profiles/*` → User Service
- `/api/music/*` → Music Service
- `/api/storage/*` → Storage Service
- `/api/system/*` → System Service

*Note: Service ports are dynamically assigned via centralized configuration system*

## Authentication

The gateway supports JWT-based authentication:

```http
Authorization: Bearer <jwt-token>
```

## Rate Limiting

API requests are rate limited:
- **Default**: 1000 requests per 15 minutes per IP
- **Authenticated**: Higher limits based on user tier

## CORS Policy

Allowed origins:
- aiponge App (via getServiceUrl('aiponge'))

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/endpoint"
}
```

### Common Error Codes

- **400** - Bad Request (Invalid input)
- **401** - Unauthorized (Missing/invalid token)
- **403** - Forbidden (Insufficient permissions)
- **404** - Not Found (Endpoint/resource not found)
- **429** - Too Many Requests (Rate limit exceeded)
- **500** - Internal Server Error
- **502** - Bad Gateway (Service unavailable)
- **504** - Gateway Timeout