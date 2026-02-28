import { createLogger } from '../logging/logger.js';

const logger = createLogger('secrets-provider');

export interface SecretsProvider {
  getSecret(key: string): Promise<string | undefined>;
  getName(): string;
}

class EnvSecretsProvider implements SecretsProvider {
  async getSecret(key: string): Promise<string | undefined> {
    return process.env[key];
  }

  getName(): string {
    return 'env';
  }
}

class AwsSsmSecretsProvider implements SecretsProvider {
  private ssmModule: { SSMClient: new (config: Record<string, unknown>) => { send: (command: unknown) => Promise<{ Parameter?: { Value?: string } }> }; GetParameterCommand: new (params: Record<string, unknown>) => unknown; } | null = null;
  private client: { send: (command: unknown) => Promise<{ Parameter?: { Value?: string } }> } | null = null;
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private readonly cacheTtlMs = parseInt(process.env.SECRETS_CACHE_TTL_MS || '300000', 10);

  private async loadSdk(): Promise<boolean> {
    if (this.ssmModule) return true;
    try {
      this.ssmModule = await Function('return import("@aws-sdk/client-ssm")')() as typeof this.ssmModule;
      this.client = new this.ssmModule!.SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });
      return true;
    } catch {
      logger.warn('AWS SDK (@aws-sdk/client-ssm) not installed - falling back to env vars');
      return false;
    }
  }

  async getSecret(key: string): Promise<string | undefined> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      if (!(await this.loadSdk())) {
        return process.env[key];
      }

      const command = new this.ssmModule!.GetParameterCommand({
        Name: key,
        WithDecryption: true,
      });
      const response = await this.client!.send(command);
      const value = response.Parameter?.Value;

      if (value) {
        this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
      }

      return value;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ParameterNotFound') {
        logger.debug('SSM parameter not found, falling back to env', { key });
        return process.env[key];
      }
      logger.error('Failed to fetch secret from SSM', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return process.env[key];
    }
  }

  getName(): string {
    return 'aws-ssm';
  }
}

let providerInstance: SecretsProvider | null = null;

export function getSecretsProvider(): SecretsProvider {
  if (!providerInstance) {
    const source = process.env.SECRETS_SOURCE || 'env';
    switch (source) {
      case 'aws-ssm':
        providerInstance = new AwsSsmSecretsProvider();
        logger.info('Using AWS SSM secrets provider');
        break;
      case 'env':
      default:
        providerInstance = new EnvSecretsProvider();
        logger.debug('Using environment variable secrets provider');
        break;
    }
  }
  return providerInstance;
}

export async function resolveSecret(key: string): Promise<string | undefined> {
  return getSecretsProvider().getSecret(key);
}
