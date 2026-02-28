import type { Request, Response, NextFunction } from 'express';

interface TraceApiModule {
  trace: {
    getActiveSpan(): { spanContext(): { traceId: string; spanId: string }; setAttribute(key: string, value: string): void } | undefined;
  };
}

let traceApiModule: TraceApiModule | null = null;
let traceApiLoaded = false;

async function getTraceApi(): Promise<TraceApiModule | null> {
  if (traceApiLoaded) return traceApiModule;
  try {
    // @ts-ignore - Optional dependency
    traceApiModule = await import('@opentelemetry/api');
  } catch {
    traceApiModule = null;
  }
  traceApiLoaded = true;
  return traceApiModule;
}

getTraceApi();

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (traceApiModule) {
    try {
      const activeSpan = traceApiModule.trace.getActiveSpan();
      if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        res.setHeader('X-Trace-Id', spanContext.traceId);
        res.setHeader('X-Span-Id', spanContext.spanId);

        const correlationId = req.headers['x-correlation-id'] as string;
        if (correlationId) {
          activeSpan.setAttribute('correlation.id', correlationId);
        }
        activeSpan.setAttribute('http.route', req.route?.path || req.path);
      }
    } catch {
      // Tracing error - continue without tracing
    }
  }

  next();
}
