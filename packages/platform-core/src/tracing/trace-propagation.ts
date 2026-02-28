export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceparent: string;
}

export function extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
  const traceparent = headers['traceparent'] as string | undefined;
  if (!traceparent) return null;

  const parts = traceparent.split('-');
  if (parts.length !== 4) return null;

  return {
    traceId: parts[1],
    spanId: parts[2],
    traceFlags: parseInt(parts[3], 16),
    traceparent,
  };
}

interface OtelTraceApi {
  context: { active(): unknown };
}

interface OtelPropagator {
  inject(
    context: unknown,
    carrier: Record<string, string>,
    setter: { set: (c: Record<string, string>, key: string, value: string) => void }
  ): void;
}

let otelModules: { traceApi: OtelTraceApi; propagator: OtelPropagator } | null = null;
let otelLoaded = false;

async function loadOtelModules(): Promise<typeof otelModules> {
  if (otelLoaded) return otelModules;
  try {
    // @ts-ignore - Optional dependency
    const traceApi = await import('@opentelemetry/api');
    // @ts-ignore - Optional dependency
    const core = await import('@opentelemetry/core');
    otelModules = { traceApi, propagator: new core.W3CTraceContextPropagator() };
  } catch {
    otelModules = null;
  }
  otelLoaded = true;
  return otelModules;
}

loadOtelModules();

export function propagateTraceContext(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!otelModules) return headers;

  try {
    const context = otelModules.traceApi.context.active();
    const carrier: Record<string, string> = {};

    otelModules.propagator.inject(context, carrier, {
      set: (c: Record<string, string>, key: string, value: string) => {
        c[key] = value;
      },
    });

    if (carrier['traceparent']) {
      headers['traceparent'] = carrier['traceparent'];
    }
    if (carrier['tracestate']) {
      headers['tracestate'] = carrier['tracestate'];
    }
  } catch {
    // OpenTelemetry not available
  }

  return headers;
}
