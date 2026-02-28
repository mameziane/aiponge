import type { IProviderClient } from '../interfaces/IProviderClient';
import { MusicApiProvider } from './MusicApiProvider';
import { MusicProviderOrchestrator } from './MusicProviderOrchestrator';
import type { IMusicProviderOrchestrator } from '../interfaces/IMusicProvider';

let cachedOrchestrator: IMusicProviderOrchestrator | null = null;

export function createMusicOrchestrator(providersClient: IProviderClient): IMusicProviderOrchestrator {
  if (cachedOrchestrator) return cachedOrchestrator;

  const musicApiProvider = new MusicApiProvider(providersClient);

  cachedOrchestrator = new MusicProviderOrchestrator([musicApiProvider], 'musicapi');

  return cachedOrchestrator;
}
