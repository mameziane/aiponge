/**
 * Global Type Declarations
 * Global types and interface augmentations for the API Gateway
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
      PORT?: string;
      API_GATEWAY_HOST?: string;

      // Service discovery
      SYSTEM_SERVICE_URL?: string;
      HEALTH_CHECK_INTERVAL?: string;
      DISCOVERY_PROBE_INTERVAL?: string;

      // Security
      JWT_SECRET?: string;
      API_KEY?: string;

      // External services
      REDIS_URL?: string;
      DATABASE_URL?: string;
    }
  }

  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      startTime?: number;
    }
  }
}

// This is a module that augments global scope
export {};
