import { getLogger } from '../config/service-urls';
import { getDatabase } from './database/DatabaseConnectionFactory';
import type { IUserServiceClient } from '../domains/music-catalog/ports/IUserServiceClient';
import type { IStorageServiceClient } from '../domains/music-catalog/ports/IStorageServiceClient';
import type { IAnalyticsServiceClient } from '../domains/music-catalog/ports/IAnalyticsServiceClient';
import type { IAIContentServiceClient } from '../domains/music-catalog/ports/IAIContentServiceClient';
import type { IBookServiceClient } from '../domains/music-catalog/ports/IBookServiceClient';
import type { IAudioProcessingClient } from '../domains/music-catalog/ports/IAudioProcessingClient';
import type { IProvidersClient } from '../domains/ai-music/ports/IProvidersClient';
import type { ILyricsTimelineClient } from '../domains/ai-music/ports/ILyricsTimelineClient';
import type { ITemplateServiceClient } from '../domains/ai-music/ports/ITemplateServiceClient';
import type { DatabaseConnection } from './database/DatabaseConnectionFactory';
import { UserServiceClient } from '../infrastructure/clients/UserServiceClient';
import { StorageServiceClient } from '../infrastructure/clients/StorageServiceClient';
import { AnalyticsServiceClient } from '../infrastructure/clients/AnalyticsServiceClient';
import { AIContentServiceClient } from '../infrastructure/clients/AIContentServiceClient';
import { getBookServiceClient } from '../infrastructure/clients/BookServiceClient';
import { AudioProcessingClient } from '../infrastructure/clients/AudioProcessingClient';
import { ProvidersServiceClient } from '../infrastructure/clients/ProvidersServiceClient';
import { MusicApiLyricsTimelineClient } from '../infrastructure/clients/MusicApiLyricsTimelineClient';
import { MusicTemplateServiceClient } from '../infrastructure/clients/TemplateEngineServiceClient';

const logger = getLogger('music-service:service-factory');

export interface ServiceRegistry {
  db: DatabaseConnection;
  userClient: IUserServiceClient;
  storageClient: IStorageServiceClient;
  analyticsClient: IAnalyticsServiceClient;
  aiContentClient: IAIContentServiceClient;
  bookClient: IBookServiceClient;
  audioProcessingClient: IAudioProcessingClient;
  providersClient: IProvidersClient;
  lyricsTimelineClient: ILyricsTimelineClient;
  templateClient: ITemplateServiceClient;
}

let registry: ServiceRegistry | null = null;

export function getServiceRegistry(): ServiceRegistry {
  if (!registry) {
    registry = createProductionRegistry();
  }
  return registry;
}

export function setServiceRegistry(custom: ServiceRegistry): void {
  registry = custom;
  logger.info('Service registry overridden (test mode)');
}

export function resetServiceRegistry(): void {
  registry = null;
}

function createProductionRegistry(): ServiceRegistry {
  logger.info('Creating production service registry');

  return {
    db: getDatabase(),
    userClient: new UserServiceClient(),
    storageClient: new StorageServiceClient(),
    analyticsClient: new AnalyticsServiceClient(),
    aiContentClient: new AIContentServiceClient(),
    bookClient: getBookServiceClient(),
    audioProcessingClient: new AudioProcessingClient(),
    providersClient: new ProvidersServiceClient(),
    lyricsTimelineClient: new MusicApiLyricsTimelineClient(),
    templateClient: new MusicTemplateServiceClient(),
  };
}
