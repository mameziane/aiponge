import { createLogger } from '../logging/index.js';

const logger = createLogger('tracing');

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  jaegerEndpoint?: string;
  enabled?: boolean;
  samplingRatio?: number;
}

let tracingInitialized = false;

export async function initTracing(config: TracingConfig): Promise<void> {
  if (tracingInitialized) {
    logger.warn('Tracing already initialized, skipping');
    return;
  }

  const enabled = config.enabled ?? process.env.OTEL_TRACING_ENABLED === 'true';
  if (!enabled) {
    logger.debug('Tracing disabled, skipping initialization', { serviceName: config.serviceName });
    tracingInitialized = true;
    return;
  }

  const jaegerEndpoint =
    config.jaegerEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

  try {
    // @ts-ignore - Optional dependency, gracefully degrades if not installed
    const sdkNode = await import('@opentelemetry/sdk-node').catch(() => null);
    // @ts-ignore - Optional dependency
    const autoInstrumentations = await import('@opentelemetry/auto-instrumentations-node').catch(() => null);
    // @ts-ignore - Optional dependency
    const otlpExporter = await import('@opentelemetry/exporter-trace-otlp-http').catch(() => null);
    // @ts-ignore - Optional dependency
    const resources = await import('@opentelemetry/resources').catch(() => null);
    // @ts-ignore - Optional dependency
    const semconv = await import('@opentelemetry/semantic-conventions').catch(() => null);

    if (!sdkNode || !autoInstrumentations || !otlpExporter || !resources || !semconv) {
      logger.warn(
        'OpenTelemetry packages not installed - tracing disabled. Install @opentelemetry/sdk-node and related packages to enable.'
      );
      tracingInitialized = true;
      return;
    }

    const traceExporter = new otlpExporter.OTLPTraceExporter({ url: jaegerEndpoint });

    const semconvRecord = semconv as Record<string, unknown>;
    const serviceName = (semconvRecord.ATTR_SERVICE_NAME as string) ?? 'service.name';
    const serviceVersion = (semconvRecord.ATTR_SERVICE_VERSION as string) ?? 'service.version';

    const resourcesRecord = resources as Record<string, unknown>;
    const defaultExport = resourcesRecord.default as Record<string, unknown> | undefined;
    const ResourceClass = (resourcesRecord.Resource ?? defaultExport?.Resource) as new (attrs: Record<string, string>) => unknown;

    const sdk = new sdkNode.NodeSDK({
      resource: new ResourceClass({
        [serviceName]: config.serviceName,
        [serviceVersion]: config.serviceVersion ?? '1.0.0',
      }) as import('@opentelemetry/resources').Resource,
      traceExporter,
      instrumentations: [
        autoInstrumentations.getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
        }),
      ],
    });

    sdk.start();
    tracingInitialized = true;

    logger.info('OpenTelemetry tracing initialized', {
      serviceName: config.serviceName,
      endpoint: jaegerEndpoint,
    });

    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => logger.info('Tracing SDK shut down'))
        .catch((err: unknown) => logger.error('Error shutting down tracing SDK', { error: err }));
    });
  } catch (error) {
    logger.warn('Failed to initialize OpenTelemetry tracing', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracingInitialized = true;
  }
}

interface NoopSpan {
  end: () => void;
  setAttribute: () => void;
  setStatus: () => void;
  recordException: () => void;
}

export function getTracer(name: string, version?: string) {
  try {
    const api = require('@opentelemetry/api');
    return api.trace.getTracer(name, version ?? '1.0.0');
  } catch {
    return {
      startSpan: (_spanName: string) => ({
        end: () => {},
        setAttribute: () => {},
        setStatus: () => {},
        recordException: () => {},
      }),
      startActiveSpan: <T>(_name: string, fn: (span: NoopSpan) => T): T => {
        const noopSpan = {
          end: () => {},
          setAttribute: () => {},
          setStatus: () => {},
          recordException: () => {},
        };
        return fn(noopSpan);
      },
    };
  }
}
